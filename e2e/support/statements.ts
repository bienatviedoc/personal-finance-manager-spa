import path from 'node:path'

/**
 * A statement from the API repository's golden files (its tests/statements), such as `vietcombank-sample.csv`, by
 * its path: the API's clone is where scripts/e2e.sh found it (`PFM_API_DIR`), or else the one next to this one.
 */
export function syntheticStatement(name: string): string {
  return path.resolve(process.env.PFM_API_DIR ?? '../personal-finance-manager-api', 'tests/statements/synthetic-stand-ins', name)
}
