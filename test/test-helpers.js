'use strict'
const tmp = require('tmp'),
    expect = require('chai').expect,
    fs = require('fs-extra'),
    path = require('path'),
    childProcess = require('child_process')

exports.makeTmpPath = function() {
    let tmpObj = tmp.dirSync({template: '/tmp/npm_share_test_XXXXXXX'});
    // console.log("Dir: ", tmpObj.name)
    return tmpObj
}

exports.runNpmFlattenCommand = function(args) {
    let cmd = 'SHARED_MODULES=' + args.sharedModulesPath
    cmd += ' ./npm-flatten.js --production '
    cmd += args.modulePath + ' 2>&1'
    console.log(`[${cmd}]`)
    const result = childProcess.execSync(cmd).toString()
    console.log('OUTPUT: ' + result)
    expect(result).to.contain('Succesfully flattened')
    exports.checkForNoBrokenSymlinks(args.sharedModulesPath)
    exports.checkForNoBrokenSymlinks(args.modulePath)
    return result
}

exports.makeSharedModules = function(basePath) {
    let sharedModulesPath = path.join(basePath, 'shared_modules')
    fs.mkdirSync(sharedModulesPath)
    return sharedModulesPath
}

exports.makeModule = function(name, basePath, packageJson) {
    let m = {}
    if (!packageJson) packageJson = {}
    packageJson.name = name
    m.fullPath = path.join(basePath, name)
    fs.mkdirSync(m.fullPath)
    m.nodeModulesPath = path.join(m.fullPath, 'node_modules')
    fs.mkdirSync(m.nodeModulesPath)
    m.packageJsonPath = path.join(m.fullPath, 'package.json')
    fs.outputJsonSync(m.packageJsonPath, packageJson)
    return m
}

exports.addModuleToModule = function(m, name, packageJson) {
    let newModule = exports.makeModule(name, m.nodeModulesPath, packageJson)

    let thisPackageJson = fs.readJsonSync(m.packageJsonPath)
    if (!thisPackageJson.dependencies) thisPackageJson.dependencies = {}
    thisPackageJson.dependencies[name] = '*'
    fs.outputJsonSync(m.packageJsonPath, thisPackageJson)
    return newModule
}

exports.removeDependency = function(m, name) {
    let packageJson = fs.readJsonSync(m.packageJsonPath)
    if (!packageJson.dependencies[name]) throw new Error('Cannot find depedency ' + name + ' to remove')
    delete packageJson.dependencies[name]
    fs.outputJsonSync(m.packageJsonPath, packageJson)
}

exports.addPeerDepenency = function(m, name) {
    let packageJson = fs.readJsonSync(m.packageJsonPath)
    if (!packageJson.peerDependencies) packageJson.peerDependencies = {}
    packageJson.peerDependencies[name] = '*'
    fs.outputJsonSync(m.packageJsonPath, packageJson)
}

exports.addDevDepenency = function(m, name) {
    let packageJson = fs.readJsonSync(m.packageJsonPath)
    if (!packageJson.devDependencies) packageJson.devDependencies = {}
    packageJson.devDependencies[name] = '*'
    fs.outputJsonSync(m.packageJsonPath, packageJson)
}

exports.tidyUpTmpPath = function(tmpObj) {
    // fs.removeSync(tmpObj.name)
    // tmpObj.cleanupCallback()
}

exports.checkForNoBrokenSymlinks = function(d) {
    const result = childProcess.execSync(`find "${d}" -type l ! -exec test -e {} \\; -print`).toString()
    if (!result.match(/^\s*$/)) {
        throw new Error('Broken symlinks:\n' + result)
    }
}

exports.listDirectoriesWithinAllNodeModules = function(d) {
    const cmd = `find ${d} -type d -name node_modules -exec find {} -mindepth 1 -maxdepth 1 -type d \\;`
    return childProcess.execSync(cmd)
        .toString()
        .split('\n')
        .filter(x => { return !x.match(/^\s*$/) })
}

exports.listSymlinksWithinAllNodeModules = function(d) {
    const cmd = `find ${d} -type d -name node_modules -exec find {} -mindepth 1 -maxdepth 1 -type l \\;`
    console.log(`[${cmd}]`)
    return childProcess.execSync(cmd)
        .toString()
        .split('\n')
        .filter(x => { return !x.match(/^\s*$/) })
}
