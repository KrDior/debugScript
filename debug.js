#!/usr/bin/env node

const cp = require('child_process')
const fs = require('fs')
const dns = require('dns')
const https = require('https')
const os = require('os')
const { promisify } = require('util')

const axios = require('axios')
const xml2js = require('xml2js')
const moment = require('moment')
const chalk = require('chalk')
const semver = require('semver')

const HOME_DIR =
  process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE

const exec = command => cp.execSync(command).toString().trim()
const log = console.log.bind(console)

const section = async (name, callback) => {
  const WIDTH = process.stdout.columns
  const start = chalk.dim('* ')
  const end = chalk.dim(' *')
  const line = chalk.dim('='.repeat(WIDTH))

  console.log(line)
  console.log(
    start + chalk.green(name) + ' '.repeat(WIDTH - name.length - 4) + end
  )
  console.log(line)

  await callback()

  console.log('')
}

const error = message => console.error(chalk.red(`→ ${message}`))
const warn = message => console.warn(chalk.yellow(`→ ${message}`))

// Consider using https://github.com/sindresorhus/macos-release instead
const getMacOsVersion = async () => {
  const path = '/System/Library/CoreServices/SystemVersion.plist'
  const content = fs.readFileSync(path, 'utf8')
  const { plist } = await xml2js.parseStringPromise(content)

  // Returns `Mac OS X` (at index 2) and `10.15.6` (at index 3)
  return plist.dict[0].string.slice(2, 4).join(' ')
}

const ping = async url => {
  try {
    await axios.get(url, {
      // This is necessary to circumvent a `UNABLE_TO_VERIFY_LEAF_SIGNATURE`
      // Node.js error (at least in our case).
      // See: https://stackoverflow.com/questions/20082893/unable-to-verify-leaf-signature
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    })

    return true
  } catch {
    return false
  }
}

const hasInternetAccess = async () => {
  try {
    await promisify(dns.resolve)('www.google.com')

    return true
  } catch {
    return false
  }
}

const isDockerRunning = () => {
  try {
    cp.execSync('docker version', { stdio: 'ignore' })

    return true
  } catch {
    return false
  }
};

(async () => {
  await section('System', async () => {
    const onVPN = await ping('https://metadata.int.thomsonreuters.com')

    log('Username:', process.env.USERNAME)
    // log('Operating System:', await getMacOsVersion())
    log('Distribution:', os.platform())
    log('CPUs:', os.cpus().length)
    // log('userInfo:', os.userInfo())
    // log('networkInterfaces:', os.networkInterfaces())
    log('Internet:', await hasInternetAccess())
    log('VPN:', onVPN)
    log('Docker running:', isDockerRunning())
  })

  await section('Node', async () => {
    const nodeVersion = exec('node -v')
    const expected = 'v12.18.3';
    const hasNvm = exec('echo $NVM_DIR') !== ''
    const readdir = promisify(fs.readdir)
    const stat = promisify(fs.stat)
    const lastInstall = moment((await stat('./node_modules/moment')).birthtime)
    const oldInstall = moment().diff(lastInstall, 'days') >= 7

    log('Version:', nodeVersion)

    if (!semver.satisfies(nodeVersion, expected)) {
      error(
        `Installed Node version (${nodeVersion}) does not satisfy expectations (${expected}); please update.`
      )
      error(`nvm install ${expected.slice(2)}`)
    }

    log('npm:', exec('npm -v'))
    log('nvm:', hasNvm)

    if (!hasNvm) {
      error('Node version manager missing; please install nvm.')
      error('https://github.com/nvm-sh/nvm')
    }

    log('Env:', process.env.NODE_ENV)
    log('Modules:', (await readdir('./node_modules')).length)
    log('Installed:', lastInstall.fromNow())

    if (oldInstall) {
      warn('The last node_modules install is over a week old.')
      warn('Consider reinstalling dependencies: `npm ci`.')
    }
  })

  await section('Git', async () => {
    const mainBranch = 'develop'
    const branch = exec('git branch --show-current')
    const difference = Number(exec(`git log --oneline ${branch} ^${mainBranch} | wc -l`))
    const threshold = 10

    log('Branch:', branch)
    log('Difference:', difference)


    if (difference > threshold) {
      console.warn(
        `The local branch (${branch}) is over ${threshold} commits apart (${difference}) from ${mainBranch}; consider rebasing.`
      )
    }

    log('Last commit:', exec('git log -1 --pretty=%B').trim())
    log('Clean:', exec('git status --porcelain') === '')
  })
})()
