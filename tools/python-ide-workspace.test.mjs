import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createPythonIDEShell} from '../js/python-ide-workspace.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('js/python-ide-workspace.js'),controller=read('js/python-lab.js'),worker=read('python-lab-worker.js'),styles=read('python-ide-workspace.css');
const prefix=shell.slice(0,shell.indexOf('export function createPythonIDEShell('));
const helpers=vm.runInNewContext(prefix+';({cleanPath,validPath,safeImportPath,folderChain,parent})');
test('Python IDE shell exports a working entrypoint and all scripts parse',()=>{
 assert.equal(typeof createPythonIDEShell,'function');
 for(const file of [worker,controller.replace(/^import .*;\n/gm,''),shell.replace('export function createPythonIDEShell','function createPythonIDEShell')])assert.doesNotThrow(()=>new Function(file));
});
test('Python virtual file paths normalize safely and reject traversal',()=>{
 assert.equal(helpers.cleanPath('images\\photos\\sample.png'),'images/photos/sample.png');
 assert.equal(helpers.cleanPath('../secret.py'),'');
 assert.equal(helpers.cleanPath('/images/./bad.png'),'');
 assert.equal(helpers.validPath('images/a.png'),true);
 assert.equal(helpers.validPath('images/2026.jpg'),true);
 assert.equal(helpers.safeImportPath('photos/2026 Drone.jpg'),'photos/_2026_Drone.jpg');
 assert.equal(helpers.validPath('models/calibration/data.csv'),true);
 for(const path of ['../secret.py','images/../../pwd','a b.py','a/<script>.svg','/absolute.py','folder//file.py'])assert.equal(helpers.validPath(path),false,path);
 assert.equal(helpers.parent('images/camera/frame.png'),'images/camera');
 assert.deepEqual([...helpers.folderChain('images/camera')],['images','images/camera']);
});
test('IDE has collapsible project, right tools, dock and viewport layout',()=>{
 for(const token of ['pythonProjectExplorer','pythonExplorerTree','pythonBottomDock','py-tool-rail','py-tool-floating','ResizeObserver','python-project-picker'])assert.ok(shell.includes(token)||styles.includes(token),token);
 for(const token of ['.python-ide-layout','--py-work-height','py-bottom-closed','py-right-closed','.py-project-explorer','.py-ide-menu-content'])assert.ok(styles.includes(token),token);
 for(const token of ['pythonNewFileBtn','pythonImportBtn','pythonExportBtn','pythonUndoFileBtn','pythonRedoFileBtn'])assert.ok(shell.includes(token),token);
});
test('browser image/file assets are archived and available inside Pyodide',()=>{
 for(const token of ['indexedDB.open(DB,1)','assetPayload','webkitdirectory','folderInput','copySelected','renameSelected','toB64','fromB64','assetQuery'])assert.ok(shell.includes(token),token);
 for(const token of ['workspace.assetPayload','workspace.restore(data)','version:2','PY_FILE_PATH','getFolder()'])assert.ok(controller.includes(token),token);
 for(const token of ['msg.assets','FS.mkdirTree','FS.writeFile','FS.chdir','_zj_script_folder'])assert.ok(worker.includes(token),token);
 for(const path of ['index.html','lab.html'])assert.ok(read(path).includes('python-ide-workspace.css'),path);
 for(const asset of ['python-ide-workspace.css','js/python-ide-workspace.js','assets/python-ide-icons.svg'])assert.ok(read('sw.js').includes(asset),asset);
});
