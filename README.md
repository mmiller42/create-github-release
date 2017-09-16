# create-github-release [![CircleCI](https://circleci.com/gh/mmiller42/create-github-release.svg?style=svg)](https://circleci.com/gh/mmiller42/create-github-release)

[![Greenkeeper badge](https://badges.greenkeeper.io/mmiller42/create-github-release.svg)](https://greenkeeper.io/)

Tool for generating GitHub releases after publishing a module.

Generates a summary of the commits and changes between the given tag and the previously released tag. The previously released tag will always be the tag with the next lesser semantic version, i.e. all tags will be sorted, then a diff will be computed between the given tag and the tag immediately behind it.

## Installation

```bash
npm install --save-dev create-github-release
```

## CLI

```
create-github-release [--config=<configPath>] <tag1> [<tag2>...]
```

The CLI tool requires you to define a configuration file in your repository. By default, it will look for a file in your repository root called `github-release.config.js`.

You may also specify a different path by using the `--config` option.

### Configuration

The configuration file must export an object, which can have the following properties:

| Property              | Type     | Description                                                                                                           | Default                                                  |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `authenticateOptions` | object   | An object defining the authentication method. [See methods](https://github.com/mikedeboer/node-github#authentication) | *Required*                                               |
| `owner`               | string   | The GitHub username or organization name that owns the repository.                                                    | *Required*                                               |
| `repo`                | string   | The name of the repository.                                                                                           | *Required*                                               |
| `template`            | string   | The path to a Mustache template that will be used to generate the release notes.                                      | [`DEFAULT_TEMPLATE`](src/defaultTemplate.md.hbs)         |
| `templateProps`       | object   | Additional data to pass to the template renderer.                                                                     | `{}`                                                     |
| `render`              | function | A function to manually render the release notes, instead of using Mustache.                                           | [`Mustache.render`](https://github.com/janl/mustache.js) |
| `showDiff`            | function | A function that accepts a file object and determines whether the diff should be rendered in the template.             | `() => true`                                             |
| `apiOptions`          | object   | Additional options to provide the [`node-github`](https://github.com/mikedeboer/node-github) constructor.             | `{}`                                                     |

### Example

```js
// github-release.config.js
module.exports = {
  authenticateOptions: {
    type: 'oauth',
    token: 'b5ef45e4a2c245a5a4243b2882034a9f',
  },
  owner: 'mmiller42',
  repo: 'html-webpack-externals-plugin',
  showDiff: file => file.filename !== 'package-lock.json',
}
```

```bash
$(npm bin)/create-github-release v1.2.3
```

## API

You can also use create-github-release programmatically by importing it into your application.

### Configuration

This module exports a function which accepts all the same arguments as the configuration file detailed above, in addition to the `tag` property:

| Property | Type   | Description         | Default    |
| -------- | ------ | ------------------- | ---------- |
| `tag`    | string | The tag to release. | *Required* |

### Example

```js
import createRelease from 'create-github-release'

createRelease({
  authenticateOptions: {
    type: 'oauth',
    token: 'b5ef45e4a2c245a5a4243b2882034a9f',
  },
  owner: 'mmiller42',
  repo: 'html-webpack-externals-plugin',
  tag: 'v1.2.3',
  showDiff: file => file.filename !== 'package-lock.json',
})
  .then(url => console.log(url))
  .catch(err => console.error(err))
```
