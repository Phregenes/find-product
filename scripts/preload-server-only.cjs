const Module = require('node:module')
const path = require('node:path')

const empty = path.join(__dirname, 'empty-module.cjs')
const original = Module._resolveFilename

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'server-only') return empty
  return original.call(this, request, parent, isMain, options)
}
