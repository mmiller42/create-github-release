#! /usr/bin/env node

import path from 'path'
import parseArgs from 'minimist'
import cosmiconfig from 'cosmiconfig'
import createRelease, { NO_PREVIOUS_RELEASE } from './index'

const run = async () => {
  const [, , ...argv] = process.argv
  const args = parseArgs(argv)
  const configPath = args.config ? path.resolve(args.config) : null
  const preview = Boolean(
    args.preview && !['false', '0', 'off', 'no'].includes(args.preview.toLowerCase())
  )
  const tags = args._
  if (tags.length === 0) {
    throw new Error('No tags provided')
  }

  const config = await cosmiconfig('github-release', {
    transform: async ({ config: _config, filePath }) => {
      let { templatePath } = _config
      if (typeof templatePath === 'string' && !path.isAbsolute(templatePath)) {
        templatePath = path.resolve(path.dirname(filePath), templatePath)
      }
      return {
        ..._config,
        templatePath,
      }
    },
  }).load('./', configPath)

  if (!config) {
    throw new Error(
      'No config file found. Create a github-release.config.js file or specify the path to the config file using the --config option'
    )
  }

  return await Promise.all(
    tags.map(async tag => {
      try {
        const result = await createRelease({ ...config, preview, tag })
        console.log(preview ? result : `Release ${tag} published at ${result}`)
      } catch (err) {
        if (err === NO_PREVIOUS_RELEASE) {
          process.emitWarning(err)
        } else {
          throw err
        }
      }
    })
  )
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
