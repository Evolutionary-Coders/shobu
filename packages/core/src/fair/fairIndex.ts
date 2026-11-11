// o que a integração com a Feira de Jogos expõe (ADR 0036 e 0037), à parte
// para o índice do core não passar do limite de linhas.
export {
  DEFAULT_FAIR_CREDIT_URL,
  type FairCreditRules,
  fairCreditOf,
  fairCreditRulesFrom,
} from './fairCredit.ts'
export { fairUserIdOf } from './fairUserId.ts'
export {
  FAIR_CREDIT_MESSAGE,
  FAIR_USER_MESSAGE,
  type FairCreditMessage,
  type FairCreditStatus,
  type FairUserMessage,
} from './fairWire.ts'
