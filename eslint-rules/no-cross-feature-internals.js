import path from 'node:path'

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
    const srcDir = path.join(context.cwd, 'src')
    const featuresDir = path.join(srcDir, 'features')
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
      if (sourceNode?.type !== 'Literal' || typeof sourceNode.value !== 'string') return
      const target = resolve(sourceNode.value)
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
    }
  },
}
