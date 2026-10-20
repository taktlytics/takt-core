---
"@vskstudio/takt-core": patch
---

The default list of tracked download extensions is now a single list shared by the SDK (`enableFiles()`) and `takt.auto.js`: 19 extensions, `pdf, xlsx, docx, pptx, csv, zip, gz, rar, 7z, dmg, exe, apk, mp3, mp4, wav, mov, avi, mkv, txt`. `exe`, `apk`, `mkv` and `txt` are now tracked by the SDK, which did not track them. `doc` and `ppt` are no longer tracked by default, as on `takt.auto.js`; pass them to `enableFiles()` to keep tracking them. A test fails if the two entry points diverge.
