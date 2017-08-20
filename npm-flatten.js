#!/usr/bin/env node
'use strict';
/**
 * SHARED_MODULES=<path> npm-flatten.js <directory>
 *
 * Given a Node app directory, flattens any Node modules within it.
 * Modules are given unique hashes so that if there are multiple versions,
 * they are maintained.
 *
 * Known bug: the hash of a module's dependencies is made before parent dependencies are inherited.
 *
 */

const fs = require('fs-extra'),
      childProcess = require('child_process'),
      program = require('commander'),
      path = require('path'),
      crypto = require('crypto'),
      foundPeerDependencies = {},
      md5Command = findMd5Command()
let pathToUse = undefined, sharedModules = undefined, exitValue = 0

checkCommandLineArguments()
const logStream = setupLogStream()
go()

function go() {
    let startTime = Date.now()
    let moduleInfo = handleSingleModuleDir(pathToUse, program.doNotFlattenTopDir)
    if (Object.keys(foundPeerDependencies).length)
        verbose('Found peer dependencies: ' + JSON.stringify(foundPeerDependencies))

    fixMovedSymlinks(sharedModules)
    let exitValue = 0
    if (Object.keys(moduleInfo.missingDependencies).length) {
        let msg = 'Unmet dependencies:\n' +
            Object.keys(moduleInfo.missingDependencies).map(d => {
                return moduleInfo.missingDependencies[d].map(x => ` - ${d} is expected by ${x}`).join('\n')
            }).join('\n')
        error(msg)
        exitValue = 1
    }

    let summaryMessage = 'Succesfully flattened ' + pathToUse
    if (moduleInfo.sharedPath) summaryMessage += ' to ' + moduleInfo.sharedPath
    summaryMessage += ' in ' + ((Date.now()-startTime)/1000) + ' seconds'
    console.log(summaryMessage)

    logStream.on('end', function() {
        logStream.end()
        process.exit(exitValue)
    })
}

/**
 * If this is a module directory (e.g. node_modules/lodash) then:
 *  - flatten any nested modules within it (i.e. within its node_modules), then
 *  - symlink this to the shared module directory
 */
function handleSingleModuleDir(d, doNotFlattenThisDir) {
    let modulesDirWithinThis = path.join(d, 'node_modules')
    let hasModulesDirWithinThis = fs.existsSync(modulesDirWithinThis)
    let missingDependencies = {}

    // STEP 1: Skip things that contain peer dependencies
    // It would be possible to flatten things with peer dependencies, but it'd be tricky
    // because peer dependencies happen further up the now-removed tree.
    const modulePackage = getModulePackage(d)
    // if (modulePackage.peerDependencies && Object.keys(modulePackage.peerDependencies).length) {
    //     verbose(`[${d}] - Skipping because it contains peer dependencies`)
    //     return { missingDependencies: {} }
    // }

    // STEP 2: Flatten any nested modules:
    if (hasModulesDirWithinThis) missingDependencies = handleNodeModulesDir(modulesDirWithinThis, modulePackage) // depth-first

    if (doNotFlattenThisDir) return { missingDependencies: missingDependencies }

    // STEP 2: Flatten this module:
    verbose(`[${d}] - ${modulePackage.name} @ ${modulePackage.version}`)
    let moduleInfo = flattenModule(d, modulePackage)

    // STEP 3: Merge the unmet dependencies from this module with all the ones from the nested modules, and return
    moduleInfo.missingDependencies = mergeDependencies(missingDependencies, moduleInfo.missingDependencies)
    return moduleInfo
}

/**
 * If this is a node_modules directory, simply loop through each module within it.
 * @param {String} Name of directory
 * @param {Object} package.json of parent directory
 */
function handleNodeModulesDir(d, modulePackage) {
    let missingDependencies = {}, modulesAndTheirSharedPaths = {}, skipped = []

    function handleModule(name, fullPath) {
        let moduleInfo = handleSingleModuleDir(fullPath)
        modulesAndTheirSharedPaths[name] = moduleInfo.sharedPath
        if (Object.keys(moduleInfo.missingDependencies).length) {
            verbose(`${d} has moved to ${moduleInfo.sharedPath} but is missing dependencies ${JSON.stringify(moduleInfo.missingDependencies)}`)
            missingDependencies = mergeDependencies(missingDependencies, moduleInfo.missingDependencies)
        }
    }

    fs.readdirSync(d).forEach(name => {
        let fullPath = d + '/' + name
        if (!isSingleModuleDir(fullPath)) return
        if (!modulePackage.dependencies || !modulePackage.dependencies[name]) {
            verbose(`'${name}' in '${d}' not present in package.json depedencies, skipping`)
            skipped[name] = fullPath
            return
        }

        handleModule(name, fullPath)
    })

    /*
     * Special case: there may be a module here that's not an immediate dependency of this
     * parent module, but is by one of the children. This happens particularly with peer depdendencies.
     */
    Object.keys(skipped).forEach(skippedModuleName => {
        if (missingDependencies[skippedModuleName]) {
            verbose(`${skippedModuleName} was skipped but will be added as it is wanted by ` +
                    missingDependencies[skippedModuleName].join(', '))
            handleModule(skippedModuleName, skipped[skippedModuleName])
        }
    })

    return replaceMissingDependenciesInChildren(missingDependencies, modulesAndTheirSharedPaths)
}

/**
 * If a child node_module has reported a missing dependency, look to see if this module has it.
 * If so, add a symlink.
 * e.g. if the tree is:
 *   A -> B -> C -> D
 *     -> E
 *
 * Then D might have a dependency for E which we will lose when flattening.
 * This function adds a symlink to replace it.
 */
function replaceMissingDependenciesInChildren(missingDependencies, nodeModulesInThisDir, nodeModulesInherited) {
    Object.keys(missingDependencies).forEach(moduleName => {
        let foundDirectory

        if (nodeModulesInThisDir[moduleName]) { // First choice is what is in current directory
            foundDirectory = nodeModulesInThisDir[moduleName]
        }
        else if (nodeModulesInherited && nodeModulesInherited[moduleName]) { // Second choice is what is in the immediate node_modules directory
            foundDirectory = nodeModulesInherited[moduleName]
        }
        else return

        missingDependencies[moduleName].forEach(placeThatNeedsDependency => {
            let nodeModuleDirOfPlaceThatNeedsDependency = path.join(placeThatNeedsDependency, 'node_modules')
            fs.ensureDirSync(nodeModuleDirOfPlaceThatNeedsDependency)
            let symlinkDest = path.join(nodeModuleDirOfPlaceThatNeedsDependency, moduleName)

            verbose(`${moduleName} - To resolve a dependency, adding ${foundDirectory} as a symlink into ${symlinkDest}`)
            ensureRelativeSymlinkSync(foundDirectory, symlinkDest)
        })
        delete missingDependencies[moduleName]
    })

    return missingDependencies
}

function flattenedDirectoryName(modulePackage, directoryHash, dependencyLinksHash) {
    // return [modulePackage.name, modulePackage.version, program.production ? 'production' : 'dev', process.version, directoryHash, dependencyLinksHash].join('@')
    return modulePackage.name + '@' + [modulePackage.version, program.production ? 'production' : 'dev', process.version, 'files=' + directoryHash, 'deps=' + dependencyLinksHash].join(',')
}

/*
 * Flattens a module, by moving it to the shared modules directory (or removing
 * it if already there). A symlink is then added so that it still compiles.
 */
function flattenModule(fullPath, modulePackage) {
    const directoryHash = getDirectoryHash(fullPath)
    const dependencyLinksHash = getModuleDependencyLinksHash(fullPath)
    let sharedPath = path.join(sharedModules, flattenedDirectoryName(modulePackage, directoryHash, dependencyLinksHash))

    let missingDependencies = []
    if (fs.existsSync(sharedPath)) {
        verbose(`${fullPath} needs removing and replacing with a symlink to ${sharedPath}`)
        fs.removeSync(fullPath)
    }
    else {
        verbose(`${fullPath} needs moving to ${sharedPath}`)
        fs.moveSync(fullPath, sharedPath)
        if (modulePackage) missingDependencies =
            checkForMissingDependencies(modulePackage.dependencies, sharedPath)
    }

    ensureRelativeSymlinkSync(sharedPath, fullPath)
    return { sharedPath: sharedPath, missingDependencies: missingDependencies, modulePackage: modulePackage }
}

/**
 * Analyses node_modules and package.json to discover missing dependencies.
 * These are then added in as symlinks to replace the inheritance that would
 * have happened were they still in the tree.
 */
function checkForMissingDependencies(dependencies, sharedPath) {
    if (!dependencies) return []
    const dependencyNames = Object.keys(dependencies)
    const thisModuleNodeModulesDir = path.join(sharedPath, '/node_modules')
    const thisModuleNodeModulesDirExists = fs.existsSync(thisModuleNodeModulesDir)
    let installedDependencies = thisModuleNodeModulesDirExists ? fs.readdirSync(thisModuleNodeModulesDir) : []
    let missingDependenciesArray = dependencyNames.filter(d => { return installedDependencies.indexOf(d) === -1 })
    let missingDependenciesObject = {}
    missingDependenciesArray.forEach(m => { missingDependenciesObject[m] = sharedPath })
    return missingDependenciesObject
}

/**
 * Given a path, returns an md5. Acts recursively.
 */
function getDirectoryHash(fullPath) {
    /**
     * The logic here is:
     * We need an md5 of this module directory.
     * We do this by analysing all files. Not symlinks as the flattened dependencies are handled as another hash.
     * We exclude package.json as it can include bits written by npm
     * We ignore the owner and group and modified time properties - they are not relevant.
      * A 12-char hash is used - sufficiently unique, not too long.
     */
    const md5GenerationCommand = 'cd "' + fullPath +'" && find . -type f -not -name package.json | gtar -c -T "-" --mtime="1970-01-01 00:00:00" --owner=0 --group=0 | ' + md5Command
    verbose(`[${md5GenerationCommand}]`)
    const result = childProcess.execSync(md5GenerationCommand)
    const md5 = result.toString().replace(/[-\s]*\n$/, '')
    if (md5.length !== 32) throw new Error('Failed to get md5. Command: ' + md5GenerationCommand + ', output: ' + md5)
    return md5.substring(20)
}

/**
 * Returns the contents of package.json
 */
function getModulePackage(fullPath) {
    const packageFile = path.join(fullPath, '/package.json')
    if (!fs.existsSync(packageFile)) throw new Error('Cannot find ' + packageFile)

    let modulePackage = fs.readJsonSync(packageFile)
    if (!modulePackage.version) modulePackage.version = 'UNKNOWN'

    let basename = path.basename(fullPath)
    if (!modulePackage.name) {
        verbose(`No name in ${packageFile}, using ${basename}`)
        modulePackage.name = basename
    }
    else if (modulePackage.name != basename) {
        verbose(`Using name '${modulePackage.name}' found in ${packageFile} rather than directory name ${basename}`)
    }

    mergePeerDependenciesIntoDependencies(modulePackage)

    // Hack to get react-dom, a peer depedency of react, to work
    if (modulePackage.dependencies && modulePackage.dependencies.react) {
        modulePackage.dependencies['react-dom'] = 'hack'
    }

    return modulePackage
}

function mergePeerDependenciesIntoDependencies(p) {
    if (!p.peerDependencies) return
    if (!p.dependencies) p.dependencies = {}
    Object.keys(p.peerDependencies).forEach(m => {
        verbose(`Module ${p.name} has a peer depedency ${m} which will be added to the list of dependencies to check`)
        p.dependencies[m] = p.peerDependencies[m]
        addToPeerDependenciesList(p.name, m)
    })
}

function addToPeerDependenciesList(m1, m2) {
    if (!foundPeerDependencies[m1]) foundPeerDependencies[m1] = {}
    if (!foundPeerDependencies[m2]) foundPeerDependencies[m2] = {}
    foundPeerDependencies[m2][m1] = undefined
    foundPeerDependencies[m1][m2] = undefined
}

/**
 * After moving directories, relative symlinks may be incorrect. This fixes.
 */
function fixMovedSymlinks(d) {
    fs.readdirSync(d).map(f => path.join(d, f)).forEach(f => {
        const stats = fs.lstatSync(f)
        if (stats.isDirectory()) {
            fixMovedSymlinks(f) // recurse
        }
        else if (stats.isSymbolicLink()) {
            let dest = fs.readlinkSync(f)
            let destAbsolute = path.resolve(path.dirname(f), dest)
            if (!fs.existsSync(destAbsolute)) {
                let correctDest = path.join(sharedModules, path.basename(dest))

                if (fs.existsSync(correctDest)) {
                    verbose(`Fixing symlink ${f} - was ${dest}, now ${correctDest}`)
                    fs.unlinkSync(f)
                    ensureRelativeSymlinkSync(correctDest, f)
                }
            }
        }
    })
}

function mergeDependencies(missingDependencies, moreMissingDependencies) {
    Object.keys(moreMissingDependencies).forEach(m => {
        if (!missingDependencies[m]) missingDependencies[m] = []
        missingDependencies[m] = missingDependencies[m].concat(moreMissingDependencies[m])
    })

    return missingDependencies
}

function checkCommandLineArguments() {
    program
      .usage('[options] <path>')
      .option('--do-not-flatten-top-dir', 'Do not flatten the top (first) directory')
      .option('--dev', 'Development build (not --production)')
      .option('--production', 'Production build')
      .parse(process.argv);

    if (program.dev === program.production) throw new Error('Please provide either --dev or --production')

    if (program.args.length !== 1) throw new Error('Usage: npm-flatten.js <path>')
    if (!process.env.SHARED_MODULES) throw new Error('SHARED_MODULES not set')
    pathToUse = path.resolve(process.cwd(), program.args[0])
    sharedModules = path.resolve(process.cwd(), process.env.SHARED_MODULES)

    if (!fs.existsSync(pathToUse)) throw new Error('Cannot find  the directory ' + pathToUse)
    if (!isSingleModuleDir(pathToUse)) throw new Error(pathToUse + ' is not a package (no package.json)')

    if (!fs.existsSync(sharedModules)) throw new Error('Cannot find the shared module directory ' + sharedModules)
    if (!fs.statSync(sharedModules).isDirectory()) throw new Error(sharedModules + ' is not a directory')
    if (path.basename(sharedModules) === 'node_modules')
        throw new Error(`Shared modules directory (${sharedModules}) cannot end with node_modules`)

    // It doesn't make sense if the shared modules directory is within the thing being flattened:
    if (sharedModules.indexOf(pathToUse) === 0) {
        // Unless the top dir is not being flattened, in which case it's ok if it's just one level deep
        if (program.doNotFlattenTopDir) {
            if (path.dirname(sharedModules) !== pathToUse &&
                path.dirname(sharedModules) !== path.join(pathToUse, 'node_modules')) {
                throw new Error(`Shared modules directory (${sharedModules}) can only be at the top level within the directory being flattened (${pathToUse}) or within its immediate node_modules directory.`)
            }
        }
        else {
            throw new Error('Shared modules directory (' + sharedModules + ') cannot exist within path being flattened (unless you use --do-not-flatten-top-dir)')
        }
    }

    /**
     * We create a node_modules directory within the shared modules dir, and put the modules in there.
     * This is because some scripts - such as Babel v6 - expect modules (after resolving) to live within node_modules.
     */
    // sharedModules = path.join(sharedModules, 'node_modules')
    // if (fs.existsSync(sharedModules)) {
    //     if (!fs.statSync(sharedModules).isDirectory()) throw new Error(sharedModules + ' is not a directory')
    // }
    // else {
    //     fs.mkdirSync(sharedModules)
    // }

}

/**
 * Create a hash that uniquely identifies all modules dependencencies.
 * A 12-char hash is used - sufficiently unique, not too long.
 */
function getModuleDependencyLinksHash(d) {
    let links = getModuleDependencyLinks(d)
    let asString = Object.keys(links).map(l => links[l]).sort().join('\n')
    return crypto.createHash('md5').update(asString).digest('hex').substring(20)
}

/**
 * Given a path, returns the flattened symlinks within node_modules
 */
function getModuleDependencyLinks(d) {
    const nodeModulesPath = path.join(d, 'node_modules')
    if (!fs.existsSync(nodeModulesPath)) return {}
    let foundLinks = {}
    fs.readdirSync(nodeModulesPath).forEach(f => {
        const fullPath = path.join(nodeModulesPath, f)
        const stats = fs.lstatSync(fullPath)
        if (stats.isSymbolicLink()) {
            let dest = fs.readlinkSync(fullPath)
            foundLinks[f] = path.basename(dest)
        }
    })

    return foundLinks
}

function setupLogStream() {
    const logFile = './npm-flatten.' + path.basename(pathToUse) + '.log'
    const logStream = fs.createWriteStream(logFile, {'flags': 'w'});
    return logStream
}

function findMd5Command() {
    if (fs.existsSync('/sbin/md5')) return '/sbin/md5'
    if (fs.existsSync('/usr/bin/md5sum')) return '/usr/bin/md5sum'
    throw new Error('Cannot find md5 or md5sum command')
}

function isNodeModulesDir(d) {
    return d.match(/node_modules\/?$/)
}

function isSingleModuleDir(d) {
    return fs.existsSync(path.join(d, 'package.json'))
}

function ensureRelativeSymlinkSync(actualDir, symlinkDir) {
    let actualDirRelative = path.relative(path.dirname(symlinkDir), actualDir)
    verbose(`Symlink '${actualDir}' to '${symlinkDir}'`)
    fs.ensureSymlinkSync(actualDirRelative, symlinkDir)
}

function verbose(str) {
    // console.log(str)
    logStream.write(str + '\n')
}

function error(str) {
    console.error('ERROR: ' + str)
    logStream.write('ERROR: ' + str + '\n')
}
