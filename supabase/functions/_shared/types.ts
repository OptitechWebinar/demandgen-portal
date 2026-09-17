// Mirrors src/types/database.ts's IcpCriteria. Duplicated rather than
// imported because Edge Functions (Deno) and the frontend (Vite/Node) are
// separate build targets with no shared module resolution between them.
export type IcpCriteria = {
  industries?: string[]
  companySizeMin?: number
  companySizeMax?: number
  titles?: string[]
  seniority?: string[]
  geographies?: string[]
  signals?: string[]
}
