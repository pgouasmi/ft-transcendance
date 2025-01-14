import { decodeToken } from "./auth";

export function setCookie(name, data) {
    let payload = decodeToken(data.access_token);
    document.cookie = `${name}=${data.access_token}; expires=${new Date(payload.exp * 1000)}; path=/`;
}

export function getCookie(name) {
    const nameEq = `${name}=`;
    return document.cookie
        .split(';')
        .map(c => c.trim())
        .find(c => c.startsWith(nameEq))
        ?.substring(nameEq.length) || null;
}

export function eraseCookie(name) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; max-age=-1; path=/`;
}