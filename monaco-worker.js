'use strict';
self.MonacoEnvironment={baseUrl:new URL('./vendor/monaco/min/',self.location.href).href};
importScripts('./vendor/monaco/min/vs/base/worker/workerMain.js');
