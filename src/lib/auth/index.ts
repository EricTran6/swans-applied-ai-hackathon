// STUB (owner T07). Clio OAuth token source: DB oauth_tokens row, else CLIO_ACCESS_TOKEN env. Refreshes when expired.
export async function getClioAccessToken(): Promise<string | null> { throw new Error("not implemented"); }
export function clioAuthorizeUrl(_state: string): string { throw new Error("not implemented"); }
export async function exchangeCode(_code: string): Promise<void> { throw new Error("not implemented"); }
