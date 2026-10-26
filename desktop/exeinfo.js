// Значок и описание у ElliottWaves.exe (вместо значка Electron). node exeinfo.js <exe> <icon.png> <версия>; нужен пакет resedit.
'use strict';
const fs = require('fs'), RE = require('resedit');
const [exe, png, ver] = process.argv.slice(2);
// .ico из одного PNG (Windows Vista+ понимает PNG внутри .ico)
const img = fs.readFileSync(png), w = img.readUInt32BE(16), h = img.readUInt32BE(20);
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = w >= 256 ? 0 : w; ico[7] = h >= 256 ? 0 : h; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(img.length, 14); ico.writeUInt32LE(22, 18);
const iconFile = RE.Data.IconFile.from(Buffer.concat([ico, img]));
const pe = RE.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
const res = RE.NtExecutableResource.from(pe);
const groups = RE.Resource.IconGroupEntry.fromEntries(res.entries);
const g = groups[0] || { id: 1, lang: 1033 };
RE.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, iconFile.icons.map((i) => i.data));
const vi = RE.Resource.VersionInfo.fromEntries(res.entries)[0];
if (vi) {
  const v = String(ver).split('.').map(Number).concat([0, 0, 0]).slice(0, 4);
  vi.setFileVersion(...v); vi.setProductVersion(...v);
  const lang = vi.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
  vi.setStringValues(lang, { FileDescription: 'Волны Эллиотта', ProductName: 'Волны Эллиотта', CompanyName: 'Егор', OriginalFilename: 'ElliottWaves.exe', InternalName: 'ElliottWaves', FileVersion: ver, ProductVersion: ver });
  vi.outputToResourceEntries(res.entries);
}
res.outputResource(pe);
fs.writeFileSync(exe, Buffer.from(pe.generate()));
