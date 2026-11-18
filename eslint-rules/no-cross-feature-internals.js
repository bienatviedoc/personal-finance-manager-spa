import path from 'node:path'

// Located from this file, not from ESLint's working directory, so the rule still applies when
// an editor runs ESLint from a parent folder.
const srcDir = path.resolve(import.meta.dirname, '..', 'src')
const featuresDir = path.join(srcDir, 'features')

/**
 * A feature (src/features/<name>) is used from outside only through its public index.
 * Code inside a feature may import its own internals freely; any other code, including
 * another feature or the app shell, may import only `@/features/<name>`.
 *
 * Import paths are resolved, so the rule sees through both the `@/` alias and relative paths.
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: "Disallow importing another feature's internals instead of its public index" },
    messages: {
      internals: "Import from '@/features/{{feature}}' (its public index), not from its internals.",
    },
    schema: [],
  },

  create(context) {
    const importer = context.filename

    const featureOf = (absolutePath) => {
      const relative = path.relative(featuresDir, absolutePath)
      if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined
      const [feature, ...rest] = relative.split(path.sep)
      return { feature, rest }
    }

    const resolve = (source) => {
      if (source.startsWith('@/')) return path.join(srcDir, source.slice(2))
      if (source.startsWith('.')) return path.resolve(path.dirname(importer), source)
      return undefined
    }

    const importerFeature = featureOf(importer)?.feature

    const check = (sourceNode) => {
      const source = staticString(sourceNode)
      if (source === undefined) return
      const target = resolve(source)
      if (!target) return

      const imported = featureOf(target)
      if (!imported?.feature || imported.feature === importerFeature) return

      const isPublicIndex = imported.rest.length === 0 || (imported.rest.length === 1 && /^index(\.[jt]sx?)?$/.test(imported.rest[0]))
      if (!isPublicIndex) {
        context.report({ node: sourceNode, messageId: 'internals', data: { feature: imported.feature } })
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      CallExpression: (node) => {
        if (!loadsModules(node.callee)) return
        const [first] = node.arguments
        // import.meta.glob takes one pattern or a list of them.
        for (const argument of first?.type === 'ArrayExpression' ? first.elements : [first]) check(argument)
      },
    }
  },
}

/** The value of a string literal or of a template literal with nothing interpolated. */
function staticString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked
  return undefined
}

/** Calls whose first argument is a module path: require, import.meta.glob and Vitest's module mocks. */
function loadsModules(callee) {
  if (callee.type === 'Identifier') return callee.name === 'require'
  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false

  const { object, property } = callee
  const isImportMeta = object.type === 'MetaProperty' && object.meta.name === 'import' && object.property.name === 'meta'
  if (isImportMeta) return property.name === 'glob'

  const isVitest = object.type === 'Identifier' && object.name === 'vi'
  return isVitest && ['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock'].includes(property.name)
}
