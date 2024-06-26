import { Router } from "express";
import {
  ConfigModule,
  MedusaContainer,
} from "@medusajs/medusa/dist/types/global";
import {
  Strategy as OAuth2Strategy,
  StrategyOptionsWithRequest,
} from "passport-oauth2";
import { PassportStrategy } from "../../core/passport/Strategy";
import {
  KeycloakProfile,
  OAUTH2_STORE_STRATEGY_NAME,
  OAuth2AuthOptions,
  Profile,
} from "./types";
import { passportAuthRoutesBuilder } from "../../core/passport/utils/auth-routes-builder";
import { validateStoreCallback } from "../../core/validate-callback";
import { AuthProvider, StrategyFactory } from "../../types";

export function getOAuth2StoreStrategy(
  id: string
): StrategyFactory<OAuth2AuthOptions> {
  const strategyName = `${OAUTH2_STORE_STRATEGY_NAME}_${id}`;
  return class extends PassportStrategy(OAuth2Strategy, strategyName) {
    constructor(
      protected readonly container: MedusaContainer,
      protected readonly configModule: ConfigModule,
      protected readonly strategyOptions: OAuth2AuthOptions,
      protected readonly strict?: AuthProvider["strict"]
    ) {
      super({
        authorizationURL: strategyOptions.authorizationURL,
        tokenURL: strategyOptions.tokenURL,
        clientID: strategyOptions.clientID,
        clientSecret: strategyOptions.clientSecret,
        callbackURL: strategyOptions.store.callbackUrl,
        passReqToCallback: true,
        scope: strategyOptions.scope,
      } as StrategyOptionsWithRequest);
    }

    async validate(
      req: Request,
      accessToken: string,
      refreshToken: string,
      profile: Profile
    ): Promise<null | { id: string }> {
      if (this.strategyOptions.store.verifyCallback) {
        return await this.strategyOptions.store.verifyCallback(
          this.container,
          req,
          accessToken,
          refreshToken,
          profile,
          this.strict
        );
      }

      return await validateStoreCallback(profile, {
        container: this.container,
        strategyErrorIdentifier: "oauth2",
        strict: this.strict,
        strategyName,
      });
    }

    userProfile(
      accessToken: string,
      done: (err: any, profile?: KeycloakProfile) => void
    ) {
      const self = this;
      let json;

      try {
        json = JSON.parse(
          Buffer.from(accessToken.split(".")[1], "base64").toString()
        );
      } catch (ex) {
        return done(new Error("Failed to parse access token"));
      }

      const profile: KeycloakProfile = {
        provider: "keycloak",
      } as any;
      profile.id = json.sub;
      profile.username = json.preferred_username;
      profile.email = json.email || "";
      profile.name = json.name || "";
      profile.given_name = json.given_name || "";
      profile.family_name = json.family_name || "";
      profile.email_verified = json.email_verified || "";
      profile.roles = json.realm_access.roles || "";

      // profile._raw = body;
      profile._json = json;

      done(null, profile);
    }
  };
}

/**
 * Return the router that hold the oauth2 store authentication routes
 * @param id
 * @param oauth2
 * @param configModule
 */
export function getOAuth2StoreAuthRouter(
  id: string,
  oauth2: OAuth2AuthOptions,
  configModule: ConfigModule
): Router {
  const strategyName = `${OAUTH2_STORE_STRATEGY_NAME}_${id}`;
  return passportAuthRoutesBuilder({
    domain: "store",
    configModule,
    authPath: oauth2.store.authPath ?? "/store/auth/oauth2",
    authCallbackPath: oauth2.store.authCallbackPath ?? "/store/auth/oauth2/cb",
    successRedirect: oauth2.store.successRedirect,
    strategyName,
    passportAuthenticateMiddlewareOptions: {},
    passportCallbackAuthenticateMiddlewareOptions: {
      failureRedirect: oauth2.store.failureRedirect,
    },
    expiresIn: oauth2.store.expiresIn,
  });
}
