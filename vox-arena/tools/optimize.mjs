// Сжимаем KayKit GLB: оставляем только нужные анимации + уменьшаем текстуры до 256px
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';

const KEEP = {
  Skeleton_Minion: ['Idle','Idle_Combat','Walking_A','Running_A','Running_B','1H_Melee_Attack_Stab','1H_Melee_Attack_Slice_Horizontal','Death_A','Death_B','Hit_A','Hit_B','Spawn_Ground'],
  Skeleton_Rogue:  ['Idle_Combat','Walking_A','Running_A','Running_B','1H_Melee_Attack_Slice_Diagonal','1H_Melee_Attack_Stab','Throw','Death_A','Hit_A','Hit_B','Spawn_Ground'],
  Skeleton_Warrior:['Idle_Combat','Idle','Walking_A','Walking_B','2H_Melee_Attack_Chop','2H_Melee_Attack_Slice','Death_A','Death_B','Hit_A','Hit_B','Spawn_Ground'],
  Skeleton_Mage:   ['Idle_Combat','Idle','Walking_A','Spellcast_Shoot','Spellcast_Long','Spellcast_Raise','1H_Ranged_Shoot','Death_A','Hit_A','Hit_B','Spawn_Ground'],
};

const io = new NodeIO();
fs.mkdirSync('assets/processed', { recursive: true });

for (const [name, keep] of Object.entries(KEEP)) {
  const src = `assets/${name}.glb`;
  const dst = `assets/processed/${name}.glb`;
  const doc = await io.read(src);
  const root = doc.getRoot();

  const kept = [];
  for (const anim of root.listAnimations()) {
    if (keep.includes(anim.getName())) { kept.push(anim.getName()); continue; }
    for (const ch of anim.listChannels()) ch.dispose();
    for (const s of anim.listSamplers()) s.dispose();
    anim.dispose();
  }

  for (const tex of root.listTextures()) {
    const img = tex.getImage();
    if (!img) continue;
    const out = await sharp(img).resize(256, 256, { fit: 'inside' }).png({ palette: true, colors: 128 }).toBuffer();
    tex.setImage(out);
    tex.setMimeType('image/png');
  }

  await doc.transform(dedup(), prune());
  await io.write(dst, doc);
  const kb = (fs.statSync(dst).size / 1024).toFixed(0);
  console.log(`${dst}: ${kb} KB | anims: ${kept.join(', ')}`);
}
console.log('DONE');
