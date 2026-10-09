# Third-party notices

`three.module.min.js` is the local Three.js engine supplied with the reference UI kit. Its MIT notice is preserved verbatim in `THREE-LICENSE.txt` and its source header remains intact.

`glb-loader.js`, component models, thumbnails, reference images and the extracted ZEBJUS application UI come from the user-supplied `ZEBJUS_Assembly_Wiring_UI_Kit.zip`. Original source comments and asset bytes are retained. This project does not grant a new license to those supplied assets; retain their existing rights and provenance when redistributing.

The current app also vendors Pyodide/Python and Matplotlib dependencies (`vendor/pyodide`, upstream license in `vendor/pyodide/LICENSE`), Monaco Editor (`vendor/monaco`), esptool-js (`vendor/esptool`), the QR encoder and jsQR (`vendor/qrgen.js`, `vendor/jsqr.js`), and the retained local hash implementation (`vendor/crypto`). Preserve each bundled license and source notice when distributing the offline package or Android assets. The repository inventory records the actual vendored files; these runtimes must not be omitted from redistribution notices.

PeerJS is loaded from a pinned CDN only for optional online code signaling. Its availability and public signaling infrastructure are external dependencies, separate from the direct local control DataChannel.
