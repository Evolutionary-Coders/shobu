// o que a integração com a Feira de Jogos expõe (ADR 0036), à parte para o
// índice do core não passar do limite de linhas.
export {
  DEFAULT_FAIR_CREDIT_URL,
  type FairCreditRules,
  fairCreditOf,
  fairCreditRulesFrom,
} from './fairCredit.ts'
export {
  FAIR_CREDENTIAL_MESSAGE,
  FAIR_CREDIT_MESSAGE,
  type FairCredentialMessage,
  type FairCreditMessage,
  type FairCreditStatus,
} from './fairWire.ts'
export {
  type IdTokenClaims,
  isIdTokenFresh,
  readIdTokenClaims,
} from './googleIdToken.ts'
export { forgeIdToken } from './idTokenForge.ts'
