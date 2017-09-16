import 'babel-polyfill'

import path from 'path'
import { readFile as _readFile } from 'fs'
import promisify from 'es6-promisify'
import forEach from 'lodash.foreach'
import isObject from 'lodash.isobject'
import GitHubApi from 'github'
import Mustache from 'mustache'
import { asc as sortVersions } from 'semver-sort'

const readFile = promisify(_readFile)
const templateCache = {}

export const DEFAULT_TEMPLATE = path.resolve(__dirname, 'defaultTemplate.md.hbs')
export const NO_PREVIOUS_RELEASE = new Error('No previous release found')

export default async config => {
  if (!isObject(config)) {
    throw new Error('config must be an object')
  }
  ;['authenticateOptions', 'owner', 'repo', 'tag'].forEach(property => {
    if (!config[property]) {
      throw new Error(`${property} property is required`)
    }
  })
  forEach(
    {
      authenticateOptions: 'object',
      owner: 'string',
      repo: 'string',
      tag: 'string',
      render: 'function',
      template: 'string',
      templateProps: 'object',
      showDiff: 'function',
      apiOptions: 'object',
    },
    (type, property) => {
      const value = config[property]
      if (value !== undefined && (type === 'object' ? !isObject(value) : typeof value !== type)) {
        throw new Error(`${property} property must be of type ${type}`)
      }
    }
  )
  if (config.template && config.render) {
    throw new Error('template and render properties are exclusive')
  }

  const {
    authenticateOptions,
    owner,
    repo,
    tag,
    template: templatePath = DEFAULT_TEMPLATE,
    templateProps = {},
    showDiff = () => true,
    apiOptions = {},
  } = config

  let render
  if (config.render) {
    render = async view => await config.render(view)
  } else {
    let fetchingTemplate = templateCache[templatePath]
    if (!fetchingTemplate) {
      fetchingTemplate = readFile(templatePath, 'utf8')
      templateCache[templatePath] = fetchingTemplate
    }
    const template = await fetchingTemplate
    render = async view => Mustache.render(template, view)
  }

  const gitHub = new GitHubApi(apiOptions)
  gitHub.authenticate(authenticateOptions)

  const { newTag, previousTag } = await fetchTags(gitHub, { owner, repo, tag })
  const { compareUrl, commits, files } = await fetchDiff(gitHub, {
    owner,
    repo,
    newTag,
    previousTag,
  })
  const pullRequests = await fetchPullRequests(gitHub, { owner, repo, commits })
  const body = await renderBody({
    owner,
    repo,
    showDiff,
    newTag,
    render,
    templateProps,
    previousTag,
    compareUrl,
    commits,
    files,
    pullRequests,
  })

  return await createRelease(gitHub, { owner, repo, newTag, body })
}

const fetchTags = async (gitHub, { owner, repo, tag }) => {
  const { data } = await gitHub.gitdata.getTags({ owner, repo })
  const tags = sortVersions(data.map(_tag => _tag.ref.split('/').pop()))

  const newTagIndex = tags.findIndex(_tag => _tag === tag)

  if (newTagIndex < 0) {
    throw new Error(`Could not find tag ${tag}`)
  } else if (newTagIndex === 0) {
    throw NO_PREVIOUS_RELEASE
  }

  return {
    newTag: tags[newTagIndex],
    previousTag: tags[newTagIndex - 1],
  }
}

const fetchDiff = async (gitHub, { owner, repo, newTag, previousTag }) => {
  const { data } = await gitHub.repos.compareCommits({
    owner,
    repo,
    base: previousTag,
    head: newTag,
  })
  return {
    compareUrl: data.html_url,
    commits: data.commits.map(commit => ({
      id: commit.sha.substr(0, 7),
      url: commit.html_url,
      author: {
        name: commit.author.login,
        url: commit.author.html_url,
        avatar: commit.author.avatar_url,
      },
      date: new Date(commit.commit.committer.date),
      message: commit.commit.message,
    })),
    files: data.files.map(file => ({
      filename: file.filename,
      url: file.blob_url,
      status: file.status,
      changes: file.changes,
      diff: file.patch || null,
    })),
  }
}

const fetchPullRequests = async (gitHub, { owner, repo, commits }) => {
  const numbers = commits
    .map(({ message }) => {
      const match = message.match(/\(#([0-9]+)\)/)
      if (match) {
        const [, number] = match
        return number
      } else {
        return null
      }
    })
    .filter(number => number)

  const pullRequests = await Promise.all(
    numbers.map(async number => {
      try {
        const [{ data: pullData }, { data: commentsData }] = await Promise.all([
          gitHub.pullRequests.get({
            owner,
            repo,
            number,
          }),
          gitHub.issues.getComments({
            owner,
            repo,
            number,
          }),
        ])
        return pullData.merged
          ? {
              url: pullData.html_url,
              number: pullData.number,
              title: pullData.title,
              body: pullData.body,
              comments: commentsData.map(comment => ({
                url: comment.html_url,
                body: comment.body,
                author: {
                  name: comment.user.login,
                  url: comment.user.html_url,
                  avatar: comment.user.avatar_url,
                },
                date: new Date(comment.created_at),
              })),
              author: {
                name: pullData.user.login,
                url: pullData.user.html_url,
                avatar: pullData.user.avatar_url,
              },
              date: new Date(pullData.merged_at),
            }
          : null
      } catch (err) {
        if (err.code === 404) {
          return null // ignore nonexistent PR's
        } else {
          throw err
        }
      }
    })
  )

  return pullRequests.filter(pullRequest => pullRequest)
}

const renderBody = async ({
  owner,
  repo,
  render,
  templateProps,
  showDiff,
  newTag,
  previousTag,
  compareUrl,
  commits,
  files,
  pullRequests,
}) =>
  await render({
    compareUrl,
    newTag: {
      name: newTag,
      url: `https://github.com/${owner}/${repo}/tree/${newTag}`,
    },
    previousTag: {
      name: previousTag,
      url: `https://github.com/${owner}/${repo}/tree/${previousTag}`,
    },
    commits: commits.map(commit => ({
      ...commit,
      message: commit.message.replace(/[\r\n]+/g, '<br>'),
    })),
    files: files.map(file => ({
      ...file,
      diff: file.diff && showDiff(file) && file.diff.replace(/`/g, '\\`'),
    })),
    pullRequests,
    icon() {
      return {
        added: ':heavy_plus_sign:',
        modified: '',
        removed: ':heavy_minus_sign:',
      }[this.status]
    },
    formattedDate() {
      return this.date.toLocaleDateString(undefined, { timeZone: 'UTC' })
    },
    avatarUrl() {
      const { avatar } = this.author
      return `${avatar}${avatar.includes('?') ? '&' : '?'}size=20`
    },
    ...templateProps,
  })

const createRelease = async (gitHub, { owner, repo, newTag, body }) => {
  const { data } = await gitHub.repos.createRelease({
    owner,
    repo,
    tag_name: newTag,
    name: newTag,
    body,
  })
  return data.html_url
}
