/**
 * Re-exports for the named-strategy registry. Connector packages import the
 * helpers they compose from here; the registry is assembled in `registry.ts`.
 */

export {
  staticTokenStrategy,
  staticTokenAuth,
  STATIC_TOKEN_STRATEGY_NAME,
  type StaticTokenParams,
} from './auth/staticToken.js';
export {
  oauthClientCredentialsStrategy,
  oauthClientCredentialsAuth,
  isExpiringSoon,
  OAUTH_CLIENT_CREDENTIALS_STRATEGY_NAME,
  type OAuthClientCredentialsParams,
} from './auth/oauthClientCredentials.js';

export {
  linkHeaderStrategy,
  parseLinkHeader,
  LINK_HEADER_STRATEGY_NAME,
  type LinkHeaderParams,
} from './pagination/linkHeader.js';
export {
  odataNextLinkStrategy,
  ODATA_NEXT_LINK_STRATEGY_NAME,
  type ODataNextLinkParams,
} from './pagination/odataNextLink.js';
export {
  cursorParamStrategy,
  CURSOR_PARAM_STRATEGY_NAME,
  type CursorParamParams,
} from './pagination/cursorParam.js';
export {
  pageNumberStrategy,
  PAGE_NUMBER_STRATEGY_NAME,
  type PageNumberParams,
} from './pagination/pageNumber.js';
