import {
    APIGatewayRequestAuthorizerEvent,
    APIGatewayAuthorizerEvent,
    PolicyDocument,
    APIGatewayProxyEvent,
    StatementEffect,
} from "aws-lambda";

import axios from "axios"
// const jwkToPem = require("jwk-to-pem");
// const jwt = require("jsonwebtoken");
import jwt from 'jsonwebtoken'
import jwkToPem from "jwk-to-pem";

export type CookieMap = { [key: string]: string } | undefined;
export type JwtToken = { sub: string; email: string } | null;
export type Jwk = {
    keys: {
        alg: string;
        e: string;
        kid: string;
        kty: string;
        n: string;
        use: string;
    }[];
};

export const parseCookies = (
    event: APIGatewayRequestAuthorizerEvent | APIGatewayProxyEvent
) => {
    if (!event.headers || !event.headers.Cookie) {
        return undefined;
    }

    const cookiesStr = event.headers.Cookie;
    const cookiesArr = cookiesStr.split(";");

    const cookieMap: CookieMap = {};

    for (let cookie of cookiesArr) {
        const cookieSplit = cookie.trim().split("=");
        cookieMap[cookieSplit[0]] = cookieSplit[1];
    }

    return cookieMap;
};

export const verifyToken = async (
    token: string,
    userPoolId: string | undefined,
    region: string
): Promise<JwtToken> => {
    try {
        const url = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
        const { data }: { data: Jwk } = await axios.get(url);

        // Get the key based on the JWT header's 'kid'
        const decodedHeader = jwt.decode(token, { complete: true })?.header;
        if (!decodedHeader?.kid) {
            throw new Error("Token does not contain a valid kid");
        }

        const key = data.keys.find(k => k.kid === decodedHeader.kid);
        if (!key) {
            throw new Error(`Unable to find key with kid: ${decodedHeader.kid}`);
        }
        const rsaKey = key as { kty: "RSA"; e: string; n: string; kid: string; use: string };

        // Convert the JWK to PEM 
        const pem = jwkToPem(rsaKey);

        return jwt.verify(token, pem, { algorithms: ["RS256"] });
    } catch (err) {
        console.error('Error verifying token:', err);
        return null;
    }
};

export const createPolicy = (
    event: APIGatewayAuthorizerEvent,
    effect: StatementEffect
): PolicyDocument => {
    return {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: effect,
                Action: "execute-api:Invoke",
                Resource: [event.methodArn],
            },
        ],
    };
};