#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборка самодостаточного Windows-запускающего exe для VOX ARENA.

Файл = [PE32+ stub (x86-64, собран вручную)] + [ZIP (STORE) с release/index.html]
в хвосте файла. Stub:
  1. GetModuleFileNameW / GetTempPathW
  2. создаёт %TEMP%\\VoxSlaughter\\
  3. извлекает index.html из хвостового ZIP (CreateFile/Read/Write)
  4. ShellExecuteW: msedge.exe --app=file:///.../index.html (app-режим,
     без вкладок); фолбэк — открыть html в браузере по умолчанию.

Проверки при сборке:
  - pefile: структура PE и импорты;
  - capstone: полная расшифровка .text;
  - ЭМУЛЯТОР x86-64: интерпретирует СБОРАННЫЕ байты с фейковыми WinAPI,
    прогоняет stub до ExitProcess и сверяет извлечённые bytes с оригиналом.
"""
import io
import os
import struct
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_HTML = os.path.join(ROOT, "release", "index.html")
OUT_DIR = os.path.join(ROOT, "dist", "windows")
OUT_EXE = os.path.join(OUT_DIR, "VoxSlaughter.exe")

# ============================================================
# Ассемблер (подмножество x86-64)
# ============================================================
REG32 = {"al": 0, "cl": 1, "dl": 2, "bl": 3, "ah": 4, "ch": 5, "dh": 6, "bh": 7,
         "eax": 0, "ecx": 1, "edx": 2, "ebx": 3, "esp": 4, "ebp": 5, "esi": 6, "edi": 7,
         "r8d": 8, "r9d": 9, "r10d": 10, "r11d": 11, "r12d": 12, "r13d": 13, "r14d": 14, "r15d": 15}
REG64 = {"rax": 0, "rcx": 1, "rdx": 2, "rbx": 3, "rsp": 4, "rbp": 5, "rsi": 6, "rdi": 7,
         "r8": 8, "r9": 9, "r10": 10, "r11": 11, "r12": 12, "r13": 13, "r14": 14, "r15": 15}
JCC = {"jz", "je", "jnz", "jne", "jb", "jae", "jbe", "ja", "js", "jns", "jl", "jge", "jle", "jg"}
JCC32EXT = {"jz": 4, "je": 4, "jnz": 5, "jne": 5, "jb": 2, "jae": 3, "jbe": 6, "ja": 7,
            "js": 8, "jns": 9, "jl": 0xB, "jge": 0xD, "jle": 0xE, "jg": 0xF}


class AsmError(Exception):
    pass


def _rex(w=False, r=False, x=False, b=False):
    v = 0x40
    if w: v |= 0x8
    if r: v |= 0x4
    if x: v |= 0x2
    if b: v |= 0x1
    return v if v != 0x40 else 0


def _modrm(mod, reg, rm):
    return bytes([mod << 6 | reg << 3 | rm])


def _sib(scale, idx, base):
    return bytes([scale << 6 | idx << 3 | base])


def _mem(mem):
    """(rex_xb, modrm, sib, disp) — REX.R/W докидывает вызывающий."""
    kind = mem[0]
    if kind == "rsp":
        off = mem[1]
        if off == 0:
            return 0, _modrm(0, 0, 4), _sib(0, 4, 4), None
        if -128 <= off < 128:
            return 0, _modrm(1, 0, 4), _sib(0, 4, 4), struct.pack("<b", off)
        return 0, _modrm(2, 0, 4), _sib(0, 4, 4), struct.pack("<i", off)  # mod=10, disp32
    if kind == "reg":
        r, off = mem[1], mem[2]
        if off == 0 and r < 8 and r != 4:
            return _rex(b=r >= 8), _modrm(0, 0, r), None, None
        if -128 <= off < 128:
            return _rex(b=r >= 8), _modrm(1, 0, r), None, struct.pack("<b", off)
        return _rex(b=r >= 8), _modrm(2, 0, r), None, struct.pack("<i", off)
    if kind == "rspidx":
        r, off = mem[1], mem[2]
        if -128 <= off < 128:
            return _rex(x=r >= 8), _modrm(1, 0, 4), _sib(1, r & 7, 4), struct.pack("<b", off)
        return _rex(x=r >= 8), _modrm(2, 0, 4), _sib(1, r & 7, 4), struct.pack("<i", off)
    if kind == "regidx":
        b, i, off = mem[1], mem[2], mem[3]
        if -128 <= off < 128:
            return _rex(x=i >= 8, b=b >= 8), _modrm(1, 0, 4), _sib(1, i & 7, b & 7), struct.pack("<b", off)
        return _rex(x=i >= 8, b=b >= 8), _modrm(2, 0, 4), _sib(1, i & 7, b & 7), struct.pack("<i", off)
    raise AsmError("mem form: %r" % (mem,))


def enc(mn, a1=None, a2=None):
    m = mn.lower()
    if m == "nop": return b"\x90"
    if m == "ret": return b"\xc3"
    if m == "sub" and a1 == "rsp" and isinstance(a2, int):
        return b"\x48\x81\xec" + struct.pack("<I", a2 & 0xFFFFFFFF)
    if m == "add" and isinstance(a1, str) and a1 in REG64 and isinstance(a2, int):
        r = REG64[a1]
        return b"\x48\x81" + bytes([0xC0 + (r & 7)]) + struct.pack("<I", a2 & 0xFFFFFFFF)
    if m == "mov":
        rd, src = a1, a2
        # mov mem16, r16  (0x66 89 /r)
        _R16 = {"ax": 0, "cx": 1, "dx": 2, "bx": 3, "sp": 4, "bp": 5, "si": 6, "di": 7}
        if isinstance(rd, tuple) and src in _R16:
            r16 = _R16[src]
            xb, modrm, sib, disp = _mem(rd)
            nm = (modrm[0] & 0xC0) | (r16 << 3) | (modrm[0] & 7)
            return b"\x66" + (bytes([xb]) if xb else b"") + bytes([0x89, nm]) + (sib or b"") + (disp or b"")  # REX только X/B из _mem (всегда с 0x40)
        if isinstance(rd, str) and rd in REG64 and isinstance(src, int):
            # mov r64, imm: кодируем как mov r32, imm32 (C7 /0) — запись в r32
            # нулевое расширение до r64; capstone декодирует корректно (5 байт)
            r = REG64[rd]
            return (bytes([_rex(b=r >= 8)]) if r >= 8 else b"") + bytes([0xC7]) + _modrm(3, 0, r & 7) + struct.pack("<I", src & 0xFFFFFFFF)
        if isinstance(rd, str) and rd in REG32 and isinstance(src, int):
            r = REG32[rd]
            return (bytes([_rex(b=True)]) if r >= 8 else b"") + bytes([0xC7]) + _modrm(3, 0, r & 7) + struct.pack("<I", src & 0xFFFFFFFF)
        if isinstance(rd, tuple) and isinstance(src, int):  # mov mem32, imm32
            xb, modrm, sib, disp = _mem(rd)
            return (bytes([xb]) if xb else b"") + bytes([0xC7]) + _modrm(modrm[0] >> 6, 0, modrm[0] & 7) + (sib or b"") + (disp or b"") + struct.pack("<I", src & 0xFFFFFFFF)
        if isinstance(rd, str) and isinstance(src, str) and rd in REG64 and src in REG64:
            # mov r64(dest), r64(src): 89 /r — reg field = SRC, rm field = DEST
            r, s = REG64[rd], REG64[src]
            return bytes([_rex(w=True, r=s >= 8, b=r >= 8)]) + bytes([0x89]) + _modrm(3, s & 7, r & 7)
        if isinstance(rd, str) and isinstance(src, str) and rd in REG32 and src in REG32:
            r, s = REG32[rd], REG32[src]
            return (bytes([_rex(r=s >= 8, b=r >= 8)]) if (r >= 8 or s >= 8) else b"") + bytes([0x89]) + _modrm(3, s & 7, r & 7)
        if isinstance(rd, str) and isinstance(src, tuple):  # mov reg(dest), mem: 8B /r reg=DEST
            is64 = rd in REG64
            r = REG64[rd] if is64 else REG32[rd]
            xb, modrm, sib, disp = _mem(src)
            nm = (modrm[0] & 0xC0) | ((r & 7) << 3) | (modrm[0] & 7)
            v = xb | (0x8 if is64 else 0) | (0x4 if r >= 8 else 0)
            if v and not (v & 0x40):
                v |= 0x40
            return (bytes([v]) if v else b"") + bytes([0x8B, nm]) + (sib or b"") + (disp or b"")
        if isinstance(rd, tuple) and isinstance(src, str):  # mov mem(dest), reg(src): 89 /r reg=SRC
            is64 = src in REG64
            s = REG64[src] if is64 else REG32[src]
            xb, modrm, sib, disp = _mem(rd)
            nm = (modrm[0] & 0xC0) | ((s & 7) << 3) | (modrm[0] & 7)
            v = xb | (0x8 if is64 else 0) | (0x4 if s >= 8 else 0)
            if v and not (v & 0x40):
                v |= 0x40
            return (bytes([v]) if v else b"") + bytes([0x89, nm]) + (sib or b"") + (disp or b"")
    if m == "movzx":  # movzx r32(dest), mem16: 0F B7 /r reg=DEST
        r = REG32[a1]
        xb, modrm, sib, disp = _mem(a2)
        nm = (modrm[0] & 0xC0) | ((r & 7) << 3) | (modrm[0] & 7)
        v = xb | (0x4 if r >= 8 else 0)
        if v and not (v & 0x40):
            v |= 0x40
        return (bytes([v]) if v else b"") + b"\x0f\xb7" + bytes([nm]) + (sib or b"") + (disp or b"")
    if m == "lea":
        if isinstance(a2, str) and a2.startswith("*"):
            return ("__rip_lea__", a1, a2[1:])
        r = REG64[a1]
        xb, modrm, sib, disp = _mem(a2)
        v = xb | 0x48 | (0x4 if r >= 8 else 0)  # REX.W (+REX.R для r8-r15)
        return bytes([v]) + b"\x8d" + _modrm(modrm[0] >> 6, r & 7, modrm[0] & 7) + (sib or b"") + (disp or b"")
    if m == "xor":
        if a1 == a2 and isinstance(a1, str):
            if a1 in REG32:
                r = REG32[a1]
                return (bytes([_rex(r=True, b=True)]) if r >= 8 else b"") + bytes([0x31]) + _modrm(3, r & 7, r & 7)
            if a1 in REG64:
                r = REG64[a1]
                return (bytes([_rex(w=True, r=True, b=True)]) if r >= 8 else b"\x48") + bytes([0x31]) + _modrm(3, r & 7, r & 7)
    if m == "test":
        if a1 == a2 and isinstance(a1, str):
            if a1 in REG32:
                r = REG32[a1]
                return (bytes([_rex(r=True, b=True)]) if r >= 8 else b"") + bytes([0x85]) + _modrm(3, r & 7, r & 7)
            if a1 in REG64:
                r = REG64[a1]
                return (bytes([_rex(w=True, r=True, b=True)]) if r >= 8 else b"\x48") + bytes([0x85]) + _modrm(3, r & 7, r & 7)
    if m == "cmp":
        if isinstance(a1, str) and isinstance(a2, int):
            # cmp r/m, imm32 = 0x81 /7 (reg field 7, НЕ 5 как у sub!)
            if a1 in REG32:
                r = REG32[a1]
                return (bytes([_rex(b=True)]) if r >= 8 else b"") + bytes([0x81]) + _modrm(3, 7, r & 7) + struct.pack("<I", a2 & 0xFFFFFFFF)
            if a1 in REG64:
                r = REG64[a1]
                return bytes([_rex(w=True, b=r >= 8)]) + bytes([0x81]) + _modrm(3, 7, r & 7) + struct.pack("<I", a2 & 0xFFFFFFFF)
        if isinstance(a1, str) and isinstance(a2, str):  # cmp r/m(a1), r(a2): reg field = a2
            if a1 in REG32 and a2 in REG32:
                rm, rr = REG32[a1], REG32[a2]
                if rm >= 8 or rr >= 8:
                    return bytes([_rex(r=rr >= 8, b=rm >= 8)]) + bytes([0x39]) + _modrm(3, rr & 7, rm & 7)
                return bytes([0x39]) + _modrm(3, rr, rm)
            if a1 in REG64 and a2 in REG64:
                rm, rr = REG64[a1], REG64[a2]
                return bytes([_rex(w=True, r=rr >= 8, b=rm >= 8)]) + bytes([0x39]) + _modrm(3, rr & 7, rm & 7)
    if m == "add" and isinstance(a1, str) and isinstance(a2, str):  # add r/m(a1), r(a2)
        if a1 in REG64 and a2 in REG64:
            rm, rr = REG64[a1], REG64[a2]
            return bytes([_rex(w=True, r=rr >= 8, b=rm >= 8)]) + bytes([0x01]) + _modrm(3, rr & 7, rm & 7)
        if a1 in REG32 and a2 in REG32:
            rm, rr = REG32[a1], REG32[a2]
            if rm >= 8 or rr >= 8:
                return bytes([_rex(r=rr >= 8, b=rm >= 8)]) + bytes([0x01]) + _modrm(3, rr & 7, rm & 7)
            return bytes([0x01]) + _modrm(3, rr, rm)
    if m == "sub" and isinstance(a1, str) and isinstance(a2, str):  # sub r/m(a1), r(a2)
        if a1 in REG32 and a2 in REG32:
            rm, rr = REG32[a1], REG32[a2]
            if rm >= 8 or rr >= 8:
                return bytes([_rex(r=rr >= 8, b=rm >= 8)]) + bytes([0x29]) + _modrm(3, rr & 7, rm & 7)
            return bytes([0x29]) + _modrm(3, rr, rm)
    if m == "sub" and isinstance(a1, str) and a1 in REG32 and isinstance(a2, int):
        r = REG32[a1]
        if r >= 8:
            return bytes([_rex(b=True)]) + bytes([0x83, 0xE8]) + bytes([a2 & 0xFF])
        return bytes([0x83, 0xE8]) + bytes([a2 & 0xFF])
    if m in ("call", "jmp") and isinstance(a1, str) and a1.startswith("*"):
        return ("__rip_call__" if m == "call" else "__rip_jmp__", a1[1:])
    if m in ("call", "jmp") and isinstance(a1, str):
        return ("__rel_call__" if m == "call" else "__rel_jmp__", a1)
    if m in JCC:
        return ("__rel32__" + m, a1)
    raise AsmError("unsupported: %s %r %r" % (m, a1, a2))


class Asm:
    def __init__(self):
        self.chunks = []

    def label(self, name):
        self.chunks.append(("__label__", name))

    def emit(self, b):
        self.chunks.append(("__code__", b))

    def build(self, resolves=None, rdata_end=None):
        """resolves: внешние имена (IAT) → offset в blob;
        rdata_end: начало кода — метки до него лежат в .rdata (+delta VA)."""
        out = bytearray()
        label_at = {}
        specials = []
        for kind, payload in self.chunks:
            if kind == "__label__":
                label_at[payload] = len(out)
                continue
            if isinstance(payload, tuple):
                if payload[0] == "__rel_call__":
                    out += b"\x00" * 5
                    specials.append((len(out) - 5, "rel_call", payload[1]))
                elif payload[0] == "__rel_jmp__":
                    out += b"\x00" * 5
                    specials.append((len(out) - 5, "rel_jmp", payload[1]))
                elif payload[0].startswith("__rel32__"):
                    out += b"\x00" * 6
                    specials.append((len(out) - 6, "jcc32_" + payload[0][9:], payload[1]))
                elif payload[0] == "__rip_call__":
                    out += b"\xff\x15" + b"\x00" * 4
                    specials.append((len(out) - 4, "rip", payload[1]))
                elif payload[0] == "__rip_lea__":
                    r = REG64[payload[1]]
                    # ModR/M: mod=00, reg=(r&7), rm=101 (rip-rel)
                    out += bytes([_rex(w=True, r=r >= 8)]) + bytes([0x8D, (r & 7) << 3 | 5]) + b"\x00" * 4
                    specials.append((len(out) - 4, "rip", payload[2]))
                else:
                    raise AsmError("unknown special %r" % (payload,))
            else:
                out += payload
        for off, kind, target in specials:
            tgt = label_at.get(target)
            is_ext = False
            if tgt is None and resolves:
                tgt = resolves.get(target)
                is_ext = tgt is not None
            if tgt is None:
                raise AsmError("unknown label: " + target)
            if kind == "rip" and rdata_end is not None and (is_ext or tgt < rdata_end):
                # цель в .rdata (строка или IAT): VA_цели = RDATA_VA + r;
                # VA_инстр = CODE_VA + (off - rdata_end); hence +gap + rdata_end
                tgt += (RDATA_VA - CODE_VA) + rdata_end
            if kind == "rel_call":
                out[off] = 0xE8; out[off+1:off+5] = struct.pack("<i", tgt - (off + 5))
            elif kind == "rel_jmp":
                out[off] = 0xE9; out[off+1:off+5] = struct.pack("<i", tgt - (off + 5))
            elif kind == "rip":
                out[off:off+4] = struct.pack("<i", tgt - (off + 4))
            elif kind.startswith("jcc32_"):
                mn = kind[6:]
                out[off] = 0x0F
                out[off+1] = 0x80 + JCC32EXT[mn]
                out[off+2:off+6] = struct.pack("<i", tgt - (off + 6))
            else:
                raise AsmError("unknown special kind: " + kind)
        return bytes(out), label_at


# ============================================================
# Программа stub
# ============================================================
F_MOD = 0x40     # путь exe (260 символов = 520 B)
F_TMP = 0x260    # %TEMP%\ (260 символов)
F_DST = 0x480    # %TEMP%\VoxSlaughter\ (300 символов)
F_HTML = 0x700   # ...\index.html (300 символов)
F_EDGE = 0x980   # --app=file:///... (300 символов)
F_HDR = 0x1200   # zip local header (64 B)
F_IO = 0x1240    # буфер IO (0x1000 B)
F_LI = 0x2240    # LARGE_INTEGER / счётчик байтов (8 B)
FRAME = 0x2250   # %16 == 0, >= F_LI+8

U16 = lambda s: s.encode("utf-16-le")
S_DIR = U16("VoxSlaughter\\")
S_HTML = U16("index.html")
S_APP = U16("--app=file:///")
S_OPEN = U16("open\0")
S_EDGE = U16("msedge.exe\0")
S_CAP = U16("VoxSlaughter\0")
S_ERR = U16("VoxSlaughter: не удалось развернуть игру.\nПопробуйте запустить файл ещё раз.\0")


def build_program(zip_start):
    zip_data_off = zip_start + 30 + 10  # local header + имя "index.html"
    a = Asm()
    a.label("RDATA_START")
    a.label("S_DIR"); a.emit(S_DIR)
    a.label("S_HTML"); a.emit(S_HTML)
    a.label("S_APP"); a.emit(S_APP)
    a.label("S_OPEN"); a.emit(S_OPEN)
    a.label("S_EDGE"); a.emit(S_EDGE)
    a.label("S_CAP"); a.emit(S_CAP)
    a.label("S_ERR"); a.emit(S_ERR)

    a.label("ENTRY")
    a.emit(enc("sub", "rsp", FRAME))

    # 1. путь модуля: GetModuleFileNameW(NULL, F_MOD, 260)
    a.emit(enc("xor", "ecx", "ecx"))
    a.emit(enc("lea", "rdx", ("rsp", F_MOD)))
    a.emit(enc("mov", "r8d", 0x104))
    a.emit(enc("call", "*GetModuleFileNameW"))

    # 2. temp: GetTempPathW(260, F_TMP)
    a.emit(enc("mov", "ecx", 0x104))
    a.emit(enc("lea", "rdx", ("rsp", F_TMP)))
    a.emit(enc("call", "*GetTempPathW"))

    # 3. F_DST = F_TMP + "VoxSlaughter\" + NUL  (copyw в символах)
    a.emit(enc("lea", "rcx", ("rsp", F_TMP)))
    a.emit(enc("call", "*lstrlenW"))
    a.emit(enc("mov", "r9d", "eax"))
    a.emit(enc("lea", "rcx", ("rsp", F_TMP)))
    a.emit(enc("lea", "rdx", ("rsp", F_DST)))
    a.emit(enc("mov", "r8d", "r9d"))
    a.emit(enc("call", "copyw"))
    a.emit(enc("lea", "rcx", "*S_DIR"))
    a.emit(enc("mov", "r8d", 13))
    a.emit(enc("call", "copyw"))
    a.emit(enc("xor", "eax", "eax"))
    a.emit(enc("mov", ("reg", 2, 0), "ax"))

    # 4. mkdir
    a.emit(enc("lea", "rcx", ("rsp", F_DST)))
    a.emit(enc("call", "*GetFileAttributesW"))
    a.emit(enc("cmp", "eax", -1))
    a.emit(enc("jne", "dir_ok"))
    a.emit(enc("xor", "edx", "edx"))
    a.emit(enc("lea", "rcx", ("rsp", F_DST)))
    a.emit(enc("call", "*CreateDirectoryW"))
    a.label("dir_ok")

    # 5. F_HTML = F_DST + "index.html" + NUL
    a.emit(enc("lea", "rcx", ("rsp", F_DST)))
    a.emit(enc("call", "*lstrlenW"))
    a.emit(enc("mov", "r9d", "eax"))
    a.emit(enc("lea", "rcx", ("rsp", F_DST)))
    a.emit(enc("lea", "rdx", ("rsp", F_HTML)))
    a.emit(enc("mov", "r8d", "r9d"))
    a.emit(enc("call", "copyw"))
    a.emit(enc("lea", "rcx", "*S_HTML"))
    a.emit(enc("mov", "r8d", 10))
    a.emit(enc("call", "copyw"))
    a.emit(enc("xor", "eax", "eax"))
    a.emit(enc("mov", ("reg", 2, 0), "ax"))

    # 6. выходной файл: CreateFileW(F_HTML, GENERIC_WRITE, 0, NULL,
    #     CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL)
    a.emit(enc("lea", "rcx", ("rsp", F_HTML)))
    a.emit(enc("mov", "edx", 0xC0000000))
    a.emit(enc("xor", "r8d", "r8d"))
    a.emit(enc("xor", "r9d", "r9d"))
    a.emit(enc("mov", ("rsp", 0x20), 2))
    a.emit(enc("mov", ("rsp", 0x28), 0x80))
    a.emit(enc("mov", ("rsp", 0x30), 0))
    a.emit(enc("call", "*CreateFileW"))
    a.emit(enc("cmp", "rax", -1))
    a.emit(enc("je", "fail"))
    a.emit(enc("mov", "r14", "rax"))

    # 7. входной файл (сам exe): CreateFileW(F_MOD, GENERIC_READ, 7, NULL,
    #     OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL)
    a.emit(enc("lea", "rcx", ("rsp", F_MOD)))
    a.emit(enc("mov", "edx", 0x80000000))
    a.emit(enc("mov", "r8d", 7))
    a.emit(enc("xor", "r9d", "r9d"))
    a.emit(enc("mov", ("rsp", 0x20), 3))
    a.emit(enc("mov", ("rsp", 0x28), 0x80))
    a.emit(enc("mov", ("rsp", 0x30), 0))
    a.emit(enc("call", "*CreateFileW"))
    a.emit(enc("cmp", "rax", -1))
    a.emit(enc("je", "fail"))
    a.emit(enc("mov", "r15", "rax"))

    # 8. zip local header: seek(zip_start) + read 64
    a.emit(enc("mov", "rax", zip_start))
    a.emit(enc("mov", ("rsp", F_LI), "rax"))
    a.emit(enc("lea", "rdx", ("rsp", F_LI)))
    a.emit(enc("mov", "rcx", "r15"))
    a.emit(enc("xor", "r8", "r8"))
    a.emit(enc("xor", "r9d", "r9d"))
    a.emit(enc("call", "*SetFilePointerEx"))
    a.emit(enc("mov", "rcx", "r15"))
    a.emit(enc("lea", "rdx", ("rsp", F_HDR)))
    a.emit(enc("mov", "r8d", 64))
    a.emit(enc("lea", "r9", ("rsp", F_LI)))
    a.emit(enc("mov", ("rsp", 0x20), 0))
    a.emit(enc("call", "*ReadFile"))
    a.emit(enc("test", "eax", "eax"))
    a.emit(enc("jz", "fail"))
    a.emit(enc("mov", "eax", ("rsp", F_HDR)))
    a.emit(enc("cmp", "eax", 0x04034B50))  # "PK\x03\x04" little-endian
    a.emit(enc("jne", "fail"))
    a.emit(enc("movzx", "eax", ("rsp", F_HDR + 26)))
    a.emit(enc("cmp", "eax", 10))
    a.emit(enc("jne", "fail"))
    a.emit(enc("movzx", "ecx", ("rsp", F_HDR + 28)))
    a.emit(enc("test", "ecx", "ecx"))
    a.emit(enc("jnz", "fail"))
    a.emit(enc("mov", "r12d", ("rsp", F_HDR + 18)))
    a.emit(enc("mov", "r13d", ("rsp", F_HDR + 22)))

    # 9. seek к данным
    a.emit(enc("mov", "rax", zip_data_off))
    a.emit(enc("mov", ("rsp", F_LI), "rax"))
    a.emit(enc("lea", "rdx", ("rsp", F_LI)))
    a.emit(enc("mov", "rcx", "r15"))
    a.emit(enc("xor", "r8", "r8"))
    a.emit(enc("xor", "r9d", "r9d"))
    a.emit(enc("call", "*SetFilePointerEx"))

    # 10. копирование чанками
    a.label("copyloop")
    a.emit(enc("test", "r12d", "r12d"))
    a.emit(enc("jz", "copydone"))
    a.emit(enc("mov", "eax", 0x1000))
    a.emit(enc("cmp", "r12d", "eax"))
    a.emit(enc("jae", "chunkok"))
    a.emit(enc("mov", "eax", "r12d"))
    a.label("chunkok")
    a.emit(enc("mov", "rcx", "r15"))
    a.emit(enc("lea", "rdx", ("rsp", F_IO)))
    a.emit(enc("mov", "r8d", "eax"))
    a.emit(enc("lea", "r9", ("rsp", F_LI)))
    a.emit(enc("mov", ("rsp", 0x20), 0))
    a.emit(enc("call", "*ReadFile"))
    a.emit(enc("test", "eax", "eax"))
    a.emit(enc("jz", "fail"))
    a.emit(enc("mov", "rcx", "r14"))
    a.emit(enc("lea", "rdx", ("rsp", F_IO)))
    a.emit(enc("mov", "r8d", ("rsp", F_LI)))
    a.emit(enc("lea", "r9", ("rsp", F_LI)))
    a.emit(enc("mov", ("rsp", 0x20), 0))
    a.emit(enc("call", "*WriteFile"))
    a.emit(enc("test", "eax", "eax"))
    a.emit(enc("jz", "fail"))
    a.emit(enc("mov", "r11d", ("rsp", F_LI)))
    a.emit(enc("sub", "r12d", "r11d"))
    a.emit(enc("jmp", "copyloop"))
    a.label("copydone")

    # 11. close
    a.emit(enc("mov", "rcx", "r15"))
    a.emit(enc("call", "*CloseHandle"))
    a.emit(enc("mov", "rcx", "r14"))
    a.emit(enc("call", "*CloseHandle"))

    # 12. edgeCmd = "--app=file:///" + htmlPath + NUL
    a.emit(enc("lea", "rcx", "*S_APP"))
    a.emit(enc("lea", "rdx", ("rsp", F_EDGE)))
    a.emit(enc("mov", "r8d", 14))
    a.emit(enc("call", "copyw"))
    a.emit(enc("lea", "rcx", ("rsp", F_HTML)))
    a.emit(enc("call", "*lstrlenW"))
    a.emit(enc("mov", "r8d", "eax"))
    a.emit(enc("lea", "rcx", ("rsp", F_HTML)))
    a.emit(enc("call", "copyw"))
    a.emit(enc("xor", "eax", "eax"))
    a.emit(enc("mov", ("reg", 2, 0), "ax"))

    # ShellExecuteW(NULL, "msedge.exe", edgeCmd, NULL, SW_SHOWNORMAL)
    a.emit(enc("xor", "ecx", "ecx"))
    a.emit(enc("lea", "rdx", "*S_EDGE"))
    a.emit(enc("lea", "r8", ("rsp", F_EDGE)))
    a.emit(enc("xor", "r9d", "r9d"))
    a.emit(enc("mov", ("rsp", 0x20), 1))
    a.emit(enc("call", "*ShellExecuteW"))
    a.emit(enc("cmp", "rax", 32))
    a.emit(enc("jg", "done"))
    # фолбэк: открыть html в браузере по умолчанию
    a.emit(enc("lea", "rcx", "*S_OPEN"))
    a.emit(enc("lea", "rdx", ("rsp", F_HTML)))
    a.emit(enc("xor", "r8d", "r8d"))
    a.emit(enc("xor", "r9d", "r9d"))
    a.emit(enc("mov", ("rsp", 0x20), 1))
    a.emit(enc("call", "*ShellExecuteW"))
    a.label("done")
    a.emit(enc("xor", "ecx", "ecx"))  # ExitProcess(uExitCode) — код в ECX
    a.emit(enc("call", "*ExitProcess"))

    # 13. ошибка
    a.label("fail")
    a.emit(enc("xor", "ecx", "ecx"))
    a.emit(enc("lea", "rdx", "*S_ERR"))
    a.emit(enc("lea", "r8", "*S_CAP"))
    a.emit(enc("mov", "r9d", 0x10))
    a.emit(enc("call", "*MessageBoxW"))
    a.emit(enc("mov", "ecx", 1))
    a.emit(enc("call", "*ExitProcess"))

    # copyw: rcx=src rdx=dst r8d=кол-во UTF-16 символов; rdx на выходе = конец
    a.label("copyw")
    a.emit(enc("test", "r8d", "r8d"))
    a.emit(enc("jz", "copyw_done"))
    a.label("cw_loop")
    a.emit(enc("movzx", "eax", ("reg", 1, 0)))
    a.emit(enc("mov", ("reg", 2, 0), "ax"))
    a.emit(enc("add", "rcx", 2))
    a.emit(enc("add", "rdx", 2))
    a.emit(enc("sub", "r8d", 1))
    a.emit(enc("jnz", "cw_loop"))
    a.label("copyw_done")
    a.emit(enc("ret"))
    return a

# Импорты / раскладка .rdata / PE
# ============================================================
IMPORTS = [
    ("kernel32.dll", ["GetModuleFileNameW", "GetTempPathW", "lstrlenW",
                       "GetFileAttributesW", "CreateDirectoryW", "CreateFileW",
                       "SetFilePointerEx", "ReadFile", "WriteFile", "CloseHandle", "ExitProcess"]),
    ("shell32.dll", ["ShellExecuteW"]),
    ("user32.dll", ["MessageBoxW"]),
]
IAT_NAMES = [n for _, fns in IMPORTS for n in fns]

RDATA_VA = 0x2000
CODE_VA = 0x1000
IMAGE_BASE = 0x140000000
FILE_ALIGN = 0x200


def rdata_layout(max_str_off):
    str_end = max_str_off + 16
    imp_dir_off = (str_end + 0xFF) & ~0xFF
    names_off = imp_dir_off + 20 * (len(IMPORTS) + 1)
    dll_names = []
    off = names_off
    for dn, _ in IMPORTS:
        dll_names.append((dn, off))
        off += len(dn) + 1
    hn_off = off
    hn = {}
    for _, fns in IMPORTS:
        for fn in fns:
            hn[fn] = hn_off
            hn_off += 2 + len(fn) + 1
    iat_off = hn_off
    # IAT-слоты: функции + NULL-терминатор на каждую DLL
    slot_of = {}
    dll_first_slot = {}
    slot = 0
    for dn, fns in IMPORTS:
        dll_first_slot[dn] = slot
        for fn in fns:
            slot_of[fn] = slot
            slot += 1
        slot += 1  # NULL
    iat_size = 8 * slot
    return dict(imp_dir_off=imp_dir_off, names_off=names_off, dll_names=dll_names,
                hn_off=hn_off, hn=hn, iat_off=iat_off, iat_size=iat_size,
                slot_of=slot_of, dll_first_slot=dll_first_slot,
                total=iat_off + iat_size)


def rdata_bytes(rdata_str_bytes, rdata_map):
    L = rdata_layout(len(rdata_str_bytes))
    rd = bytearray(L["total"])
    rd[:len(rdata_str_bytes)] = rdata_str_bytes
    # имп. директория: OriginalFirstThunk, TS, ForwarderChain, Name, FirstThunk
    i = 0
    for dn, fns in IMPORTS:
        first_rva = RDATA_VA + L["iat_off"] + 8 * L["dll_first_slot"][dn]
        dnrva = [o for d, o in L["dll_names"] if d == dn][0]
        base = L["imp_dir_off"] + i * 20
        rd[base:base + 4] = struct.pack("<I", first_rva)       # OriginalFirstThunk
        rd[base + 12:base + 16] = struct.pack("<I", RDATA_VA + dnrva)  # Name
        rd[base + 16:base + 20] = struct.pack("<I", first_rva)  # FirstThunk
        i += 1
    for dn, o in L["dll_names"]:
        rd[o:o + len(dn) + 1] = dn.encode("ascii") + b"\x00"
    for _, fns in IMPORTS:
        for fn in fns:
            o = L["hn"][fn]
            rd[o:o + 2] = b"\x00\x00"
            rd[o + 2:o + 2 + len(fn)] = fn.encode("ascii")
            rd[o + 2 + len(fn)] = 0
    # IAT: 64-битные thunk = RVA hint/name
    for fn, slot in L["slot_of"].items():
        base = L["iat_off"] + 8 * slot
        rd[base:base + 8] = struct.pack("<Q", RDATA_VA + L["hn"][fn])
    padded = bytes(rd) + b"\x00" * (-len(rd) % FILE_ALIGN)
    return padded, L


def build_pe(code_bytes, rdata_final, L):
    code_raw = code_bytes + b"\x00" * (-len(code_bytes) % FILE_ALIGN)
    opt = b""
    opt += struct.pack("<H", 0x20b)
    opt += struct.pack("<BB", 14, 0)
    opt += struct.pack("<III", len(code_raw), len(rdata_final), 0)
    opt += struct.pack("<I", CODE_VA)
    opt += struct.pack("<I", CODE_VA)
    opt += struct.pack("<Q", IMAGE_BASE)
    opt += struct.pack("<II", 0x1000, FILE_ALIGN)
    opt += struct.pack("<HHHH", 6, 0, 0, 0)
    opt += struct.pack("<HH", 6, 0)
    opt += struct.pack("<I", 0)
    opt += struct.pack("<I", 0x3000)
    opt += struct.pack("<I", FILE_ALIGN)
    opt += struct.pack("<I", 0)
    opt += struct.pack("<H", 2)
    opt += struct.pack("<H", 0x160)
    opt += struct.pack("<QQQQ", 0x100000, 0x1000, 0x100000, 0x1000)
    opt += struct.pack("<II", 0, 16)
    dirs = [b"\x00" * 8] * 16
    dirs[1] = struct.pack("<II", RDATA_VA + L["imp_dir_off"], 20 * (len(IMPORTS) + 1))
    opt += b"".join(dirs)
    assert len(opt) == 240, len(opt)

    assert len(code_raw) <= 0x1000, "code must fit one page: %d" % len(code_raw)
    assert len(rdata_final) <= 0x1000, "rdata must fit one page: %d" % len(rdata_final)
    dos = bytearray(0x80)
    dos[0:2] = b"MZ"
    dos[0x3C:0x40] = struct.pack("<I", 0x80)
    msg = b"This program cannot be run in DOS mode.\r\r\n$"
    assert len(msg) <= 0x7E - 0x40
    dos[0x40:0x40 + len(msg)] = msg
    pe = b"PE\x00\x00"
    coff = struct.pack("<HHIIIHH", 0x8664, 2, 0, 0, 0, 240, 0x22)
    sh_text = struct.pack("<8sIIIIIIHHI", b".text", len(code_bytes), CODE_VA,
                          len(code_raw), FILE_ALIGN, 0, 0, 0, 0, 0x60000020)
    sh_rdata = struct.pack("<8sIIIIIIHHI", b".rdata", len(rdata_final), RDATA_VA,
                           len(rdata_final), FILE_ALIGN + len(code_raw), 0, 0, 0, 0, 0x40000040)
    headers = bytes(dos) + pe + coff + opt + sh_text + sh_rdata
    headers += b"\x00" * (FILE_ALIGN - len(headers))
    assert len(headers) == FILE_ALIGN
    return headers + code_raw + rdata_final


def build_zip(html_bytes):
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w") as z:
        zi = zipfile.ZipInfo("index.html", date_time=(2026, 9, 18, 12, 0, 0))
        zi.compress_type = zipfile.ZIP_STORED
        zi.external_attr = 0o644 << 16
        z.writestr(zi, html_bytes)
    data = bio.getvalue()
    assert data[0:4] == b"PK\x03\x04"
    assert struct.unpack("<H", data[8:10])[0] == 0      # STORED
    assert struct.unpack("<H", data[26:28])[0] == 10    # имя "index.html"
    assert struct.unpack("<H", data[28:30])[0] == 0     # extra = пусто
    return data


# ============================================================
# Эмулятор x86-64
# ============================================================
MASK = {1: 0xFF, 2: 0xFFFF, 4: 0xFFFFFFFF, 8: (1 << 64) - 1}


class EmuError(Exception):
    pass


class Emu:
    def __init__(self, exe_bytes, html_bytes, L):
        self.L = L
        self.regions = []  # (base, bytearray)
        self.regs = [0] * 16
        self.regs[4] = 0x1500FF008  # rsp: %16 == 8, как в Windows (верх стека)
        self.ZF = self.SF = self.CF = self.OF = 0
        self.handles = {}
        self.next_h = 1
        self.api_log = []
        self.trace = []
        self.exit_code = None
        self.exe_path = "C:\\TEMP\\VOXSLAUGHTER.EXE"
        # "файл на диске" — сам exe
        self._map(0x160000000, exe_bytes)
        self._map(0x150000000, b"\x00" * 0x100000)  # стек
        # секции
        code_raw_len = (len(exe_bytes) - FILE_ALIGN * 2) % 0x10000 or 0  # уточнит run
        self._exe = exe_bytes
        self.html = html_bytes

    def _map(self, base, data):
        self.regions.append((base, bytearray(data)))

    def map_sections(self, code_off, code_len, rdata_off, rdata_len):
        self._map(IMAGE_BASE + CODE_VA, self._exe[code_off:code_off + code_len])
        self._map(IMAGE_BASE + RDATA_VA, self._exe[rdata_off:rdata_off + rdata_len])
        self.code_raw_len = code_len

    def read(self, addr, n):
        for base, buf in self.regions:
            if base <= addr < base + len(buf):
                off = addr - base
                out = bytes(buf[off:off + n])
                if len(out) < n:
                    out += b"\x00" * (n - len(out))
                return out
        return b"\x00" * n

    def write(self, addr, data):
        for base, buf in self.regions:
            if base <= addr < base + len(buf):
                off = addr - base
                if off + len(data) > len(buf):
                    raise EmuError("write past region: %x" % addr)
                buf[off:off + len(data)] = data
                return
        raise EmuError("write to unmapped: %x" % addr)

    def rd(self, r, size):
        return self.regs[r] & MASK[size]

    def wr(self, r, v, size):
        # x86-64: запись < 64 бит нулевое расширение (верхние биты чистятся)
        self.regs[r] = v & MASK[size]

    def _flags(self, a, b, size, kind="sub"):
        if kind == "sub":
            d = (a - b) & MASK[size]
            self.CF = 1 if a < b else 0
            self.OF = 1 if ((a ^ b) & (a ^ d) & (1 << (size * 8 - 1))) else 0
        elif kind == "and":
            d = a & b
            self.CF = 0
            self.OF = 0
        else:
            d = (a + b) & MASK[size]
            self.CF = 1 if d > MASK[size] else 0
            self.OF = 1 if ((a ^ d) & (b ^ d) & (1 << (size * 8 - 1))) else 0
        self.ZF = 1 if d == 0 else 0
        self.SF = 1 if d & (1 << (size * 8 - 1)) else 0

    def u16_len(self, addr):
        n = 0
        while self.read(addr + 2 * n, 2) != b"\x00\x00":
            n += 1
            if n > 4000:
                raise EmuError("unterminated u16 string")
        return n

    def s16(self, addr):
        return self.read(addr, 2 * self.u16_len(addr)).decode("utf-16-le")

    def w16(self, addr, text, maxw):
        b = text.encode("utf-16-le")[:2 * maxw]
        self.write(addr, b)
        return len(b) // 2

    # --- WinAPI ---
    def api(self, name, a):
        self.api_log.append(name)
        if name == "GetModuleFileNameW":
            return self.w16(a[1], self.exe_path, a[2])
        if name == "GetTempPathW":
            return self.w16(a[1], "C:\\TEMP\\", a[0])
        if name == "lstrlenW":
            return self.u16_len(a[0])
        if name == "GetFileAttributesW":
            return 0xFFFFFFFF
        if name == "CreateDirectoryW":
            return 1
        if name == "CreateFileW":
            p = self.s16(a[0])
            if p.lower().endswith("index.html"):
                h = self.next_h; self.next_h += 1
                self.handles[h] = {"kind": "out", "buf": bytearray()}
                return h
            if p.lower() == self.exe_path.lower():
                h = self.next_h; self.next_h += 1
                self.handles[h] = {"kind": "in", "data": self._exe, "off": 0}
                return h
            return 0xFFFFFFFF
        if name == "SetFilePointerEx":
            f = self.handles[a[0]]
            f["off"] = struct.unpack("<q", self.read(a[1], 8))[0]
            return 1
        if name == "ReadFile":
            f = self.handles[a[0]]
            n = min(a[2], len(f["data"]) - f["off"])
            if n < 0:
                n = 0
            self.write(a[1], f["data"][f["off"]:f["off"] + n])
            f["off"] += n
            self.write(a[3], struct.pack("<I", n))
            return 1 if n else 0
        if name == "WriteFile":
            f = self.handles[a[0]]
            f["buf"] += self.read(a[1], a[2])
            self.write(a[3], struct.pack("<I", a[2]))
            return 1
        if name == "CloseHandle":
            return 1
        if name == "ShellExecuteW":
            fn, prm = self.s16(a[1]), self.s16(a[2])
            self.api_log.append("  ShellExecuteW(%r, %r)" % (fn, prm))
            return 42 if fn.lower() == "msedge.exe" else 33
        if name == "MessageBoxW":
            self.api_log.append("  MessageBoxW(%r)" % self.s16(a[1]))
            return 1
        if name == "ExitProcess":
            self.exit_code = a[0]
            return None
        raise EmuError("unknown api " + name)

    def _operand(self, o, insn, ip):
        """Возвращает ('reg', idx, size) | ('mem', addr, size) | ('imm', val)."""
        o = o.strip()
        size = 8
        inner = None
        for prefix, s in (("qword", 8), ("dword", 4), ("word", 2), ("byte", 1)):
            if o.startswith(prefix + " ptr ["):
                size = s
                inner = o.split("[", 1)[1]
                break
        if inner is None and o.startswith("["):
            inner = o[1:]
        if inner is not None:
            inner = inner.rstrip("]").strip()
            if inner.startswith("rip"):
                d = int(inner.rsplit("+", 1)[1].strip(), 16)
                return ("mem", ip + insn.size + d, size)
            parts = [p.strip() for p in inner.split("+")]
            base = parts[0]
            d = int(parts[1], 16) if len(parts) > 1 else 0
            if base in REG64:
                return ("mem", self.regs[REG64[base]] + d, size)
            raise EmuError("mem base: " + base)
        if o.startswith("0x") or o.startswith("-0x"):
            return ("imm", int(o, 16))
        if (o.isdigit() or (o.startswith("-") and o[1:].isdigit())) and not o[0].isalpha():
            return ("imm", int(o, 10))
        if o in REG32:
            return ("reg", REG32[o], 4)
        if o in REG64:
            return ("reg", REG64[o], 8)
        _r16 = {"ax": 0, "cx": 1, "dx": 2, "bx": 3, "sp": 4, "bp": 5, "si": 6, "di": 7}
        if o in _r16:
            return ("reg", _r16[o], 2)
        raise EmuError("operand: " + o)

    def run(self):
        import capstone
        md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
        md.intel = True
        code_base = IMAGE_BASE + CODE_VA
        code = bytes(self.read(code_base, self.code_raw_len))
        insns = {}
        for i in md.disasm(code, code_base):
            insns[i.address] = i
        iat_base = IMAGE_BASE + RDATA_VA + self.L["iat_off"]
        # raw slot (включая NULL-терминаторы) -> имя функции
        slot_name = {}
        slot = 0
        for dn, fns in IMPORTS:
            for fn in fns:
                slot_name[slot] = fn
                slot += 1
            slot += 1
        ip = code_base
        step = 0
        while self.exit_code is None:
            step += 1
            if step > 5000000:
                raise EmuError("too many steps")
            insn = insns.get(ip)
            if insn is None:
                raise EmuError("ip outside code: %x" % ip)
            m, op = insn.mnemonic, insn.op_str
            ops = [x.strip() for x in op.split(",")] if op else []
            self.trace.append((ip, m, op))
            if len(self.trace) > 4000:
                self.trace.pop(0)
            if m == "ret":
                ip = struct.unpack("<Q", self.read(self.regs[4], 8))[0]
                self.regs[4] += 8
            elif m == "call":
                if op.startswith("qword ptr [rip"):
                    t = self._operand(op, insn, ip)
                    slot = (t[1] - iat_base) // 8
                    name = slot_name.get(slot)
                    if name is None:
                        raise EmuError("bad IAT slot %d" % slot)
                    rsp = self.regs[4]
                    args = [self.regs[1], self.regs[2], self.regs[8], self.regs[9],
                            struct.unpack("<Q", self.read(rsp + 0x20, 8))[0],
                            struct.unpack("<Q", self.read(rsp + 0x28, 8))[0],
                            struct.unpack("<Q", self.read(rsp + 0x30, 8))[0]]
                    self.regs[4] = rsp - 8  # return address
                    self.write(self.regs[4], struct.pack("<Q", ip + insn.size))
                    r = self.api(name, args)
                    self.regs[4] = rsp  # "ret" из фейк-API: стек как до вызова
                    if self.exit_code is None and r is not None:
                        self.wr(0, r, 8)
                    ip += insn.size
                else:
                    tgt = int(op.split()[-1], 16)
                    self.regs[4] -= 8
                    self.write(self.regs[4], struct.pack("<Q", ip + insn.size))
                    ip = tgt
            elif m == "jmp":
                ip = int(op.split()[-1], 16)
            elif m in JCC:
                cond = {"jz": self.ZF == 1, "jnz": self.ZF == 0, "je": self.ZF == 1,
                        "jne": self.ZF == 0, "jae": self.CF == 0, "jb": self.CF == 1,
                        "jbe": self.CF == 1 or self.ZF == 1, "ja": self.CF == 0 and self.ZF == 0,
                        "jl": self.SF != self.OF, "jge": self.SF == self.OF,
                        "jle": self.ZF == 1 or self.SF != self.OF,
                        "jg": self.ZF == 0 and self.SF == self.OF}[m]
                ip = int(op.split()[-1], 16) if cond else ip + insn.size
            elif m == "mov":
                a = self._operand(ops[0], insn, ip)
                b = self._operand(ops[1], insn, ip)
                if a[0] == "reg":
                    if b[0] == "imm":
                        self.wr(a[1], b[1], a[2])
                    elif b[0] == "reg":
                        self.wr(a[1], self.rd(b[1], b[2]), a[2])
                    else:
                        self.wr(a[1], struct.unpack("<" + "QQHH"[0:0] + ("Q" if a[2] == 8 else "I" if a[2] == 4 else "H"),
                                                   self.read(b[1], a[2]))[0], a[2])
                else:  # mem
                    if b[0] == "imm":
                        self.write(a[1], struct.pack("<I", b[1] & 0xFFFFFFFF))
                    elif b[0] == "reg":
                        sz = b[2]
                        self.write(a[1], struct.pack("<" + ("Q" if sz == 8 else "I" if sz == 4 else "H"),
                                                     self.rd(b[1], sz)))
                ip += insn.size
            elif m == "movzx":
                a = self._operand(ops[0], insn, ip)
                b = self._operand(ops[1], insn, ip)
                v = struct.unpack("<H", self.read(b[1], 2))[0]
                self.wr(a[1], v, 4)
                ip += insn.size
            elif m == "lea":
                a = self._operand(ops[0], insn, ip)
                b = self._operand(ops[1], insn, ip)
                self.wr(a[1], b[1], 8)
                ip += insn.size
            elif m == "xor":
                if ops[0] in REG64:
                    self.wr(REG64[ops[0]], 0, 8)
                    self._flags(0, 0, 8, "and")
                else:
                    self.wr(REG32[ops[0]], 0, 4)
                    self._flags(0, 0, 4, "and")
                ip += insn.size
            elif m == "test":
                a = self._operand(ops[0], insn, ip)
                b = self._operand(ops[1], insn, ip)
                av = self.rd(a[1], a[2]) if a[0] == "reg" else struct.unpack("<I", self.read(a[1], 4))[0]
                bv = self.rd(b[1], b[2]) if b[0] == "reg" else struct.unpack("<I", self.read(b[1], 4))[0]
                self._flags(av, bv, 4, "and")
                ip += insn.size
            elif m == "cmp":
                a = self._operand(ops[0], insn, ip)
                b = self._operand(ops[1], insn, ip)
                av = self.rd(a[1], a[2]) if a[0] == "reg" else struct.unpack("<" + ("Q" if a[2] == 8 else "I"), self.read(a[1], a[2]))[0]
                bv = b[1] if b[0] == "imm" else self.rd(b[1], b[2])
                self._flags(av, bv, a[2] if a[0] == "reg" else 4, "sub")
                ip += insn.size
            elif m == "add":
                a = self._operand(ops[0], insn, ip)
                b = self._operand(ops[1], insn, ip)
                av = self.rd(a[1], a[2])
                bv = b[1] if b[0] == "imm" else self.rd(b[1], b[2])
                self.wr(a[1], av + bv, a[2])
                self._flags(av, bv, a[2], "add")
                ip += insn.size
            elif m == "sub":
                a = self._operand(ops[0], insn, ip)
                b = self._operand(ops[1], insn, ip)
                av = self.rd(a[1], a[2])
                bv = b[1] if b[0] == "imm" else self.rd(b[1], b[2])
                self.wr(a[1], av - bv, a[2])
                self._flags(av, bv, a[2], "sub")
                ip += insn.size
            else:
                raise EmuError("unsupported insn: %s %s" % (m, op))
        return True


def emulate(exe_bytes, html_bytes, L, code_raw_len, rdata_raw_len):
    emu = Emu(exe_bytes, html_bytes, L)
    code_off = FILE_ALIGN
    rdata_off = code_off + code_raw_len
    emu.map_sections(code_off, code_raw_len, rdata_off, rdata_raw_len)
    emu.run()
    # извлечённый файл
    out = None
    for h in emu.handles.values():
        if h["kind"] == "out":
            out = h
    ok = (emu.exit_code == 0
          and out is not None
          and bytes(out["buf"]) == html_bytes)
    return ok, emu


# ============================================================
# main
# ============================================================
def main():
    html = open(SRC_HTML, "rb").read()
    print("index.html: %d bytes" % len(html))

    # --- assemble (2 прохода: size → zip start → финальный) ---
    STR_TOTAL = (len(S_DIR) + len(S_HTML) + len(S_APP) + len(S_OPEN)
                 + len(S_EDGE) + len(S_CAP) + len(S_ERR))
    L0 = rdata_layout(STR_TOTAL)
    resolves = {fn: L0["iat_off"] + 8 * L0["slot_of"][fn] for fn in IAT_NAMES}

    def assemble(zip_start):
        blob, rdata_map = build_program(zip_start).build(resolves=resolves, rdata_end=STR_TOTAL)
        rdata_len = rdata_map["ENTRY"]
        assert rdata_len == STR_TOTAL
        rdata_str = blob[:rdata_len]
        code_bytes = blob[rdata_len:]
        return blob, rdata_map, rdata_str, code_bytes

    probe, rdata_map, rdata_str, code_probe = assemble(0x10000)
    code_raw_len = ((len(code_probe) + FILE_ALIGN - 1) // FILE_ALIGN) * FILE_ALIGN
    rdata_final0, L = rdata_bytes(rdata_str, rdata_map)
    rdata_raw_len = len(rdata_final0)
    zip_start = FILE_ALIGN + code_raw_len + rdata_raw_len  # конец PE-файла
    print("code=%dB raw=%d, rdata raw=%d, ZIP_START=0x%x" %
          (len(code_probe), code_raw_len, rdata_raw_len, zip_start))

    blob, rdata_map, rdata_str, code_bytes = assemble(zip_start)
    assert len(code_bytes) == len(code_probe), "code size changed between passes"
    rdata_final, L = rdata_bytes(rdata_str, rdata_map)

    pe = build_pe(code_bytes, rdata_final, L)
    assert len(pe) == zip_start, (len(pe), zip_start)
    zipdata = build_zip(html)
    exe = pe + zipdata
    print("exe: %d bytes" % len(exe))

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_EXE, "wb") as f:
        f.write(exe)
    import hashlib
    h = hashlib.sha256(exe).hexdigest()
    with open(os.path.join(OUT_DIR, "SHA256SUMS"), "w") as f:
        f.write(h + "  VoxSlaughter.exe\n")
    print("sha256:", h)

    ok = True
    # --- pefile ---
    try:
        import pefile
        pe2 = pefile.PE(OUT_EXE)
        pe2.parse_data_directories()
        print("pefile: machine=%04xx entry=0x%x" % (pe2.FILE_HEADER.Machine, pe2.OPTIONAL_HEADER.AddressOfEntryPoint))
        for d in pe2.DIRECTORY_ENTRY_IMPORT:
            print("  %s: %s" % (d.dll.decode(), [i.name.decode() for i in d.imports]))
    except ImportError:
        print("pefile: not installed (skip)")
    except Exception as e:
        print("PEFILE CHECK FAILED:", e)
        ok = False
    # --- capstone decode ---
    try:
        import capstone
        md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
        md.intel = True
        n = sum(1 for _ in md.disasm(exe[FILE_ALIGN:FILE_ALIGN + code_raw_len], 0x140001000))
        print("capstone: %d instructions" % n)
        if n < 50:
            ok = False
    except ImportError:
        print("capstone: not installed (skip emulation too!)")
    except Exception as e:
        print("DECODE FAILED:", e)
        ok = False
    # --- emulation ---
    try:
        eok, emu = emulate(exe, html, L, code_raw_len, rdata_raw_len)
        print("emulation: exit=%s extracted=%d bytes match=%s" %
              (emu.exit_code, len(html), eok))
        for line in emu.api_log:
            if line.startswith("  "):
                print(line)
        ok &= eok
    except Exception as e:
        import traceback
        traceback.print_exc()
        ok = False

    if not ok:
        print("BUILD VERIFICATION FAILED")
        sys.exit(1)
    print("EXE BUILD: OK")


if __name__ == "__main__":
    main()
