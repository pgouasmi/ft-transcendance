import { urlChange } from '../ui/router.js';
import { set_statsPanel, showBootstrapAlert, updateLoginButton } from '../ui/ui.js';
import { setCookie, getCookie, eraseCookie } from './cookies.js';
import { twoFactorAuth } from './twoFactorAuth.js';

function quitAuth(msg) {
    showBootstrapAlert(msg, 'danger');
    eraseCookie('temp_token');
    eraseCookie('jwt_token');
    set_statsPanel(null);
    getGuestToken();
    updateLoginButton(false);
}

export function getGuestToken() {
    return new Promise((resolve, reject) => {
        fetch(`https://${window.location.hostname}:7777/auth/getguesttoken/`, {
            method: 'GET'
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.error) {
                    reject(new Error(data.error));
                } else {
                    setCookie('guest_token', data);
                }
            })
            .catch((error) => reject(error));
    });
}

export async function login() {
    let data = null;
    let totp_token = null;
    let temp_token = null;

    if (getCookie('jwt_token')) {
        showBootstrapAlert('Vous ne pouvez pas vous connecter deux fois');
        urlChange(null, '/home');
        return;
    }

    try {
        await ftAPIRequest();
        temp_token = getCookie('temp_token');
        if (!temp_token) {
            return quitAuth('L\'authentification a echoue');
        }
        data = await ask2FA(temp_token);
        if (data?.status === 'setup_2fa') {
            totp_token = await twoFactorAuth(data.qr_code);
        } else if (data?.status === 'need_2fa') {
            totp_token = await twoFactorAuth(null);
        } else if (data?.error === 'Invalid 2FA code') {
            showBootstrapAlert('Invalid 2FA code, please try again');
            totp_token = await twoFactorAuth(null);
        } else {
            return quitAuth("Erreur lors de l'authentification : " + data?.error);
        }

        if (!totp_token) {
            return quitAuth('L\'authentification a echoue');
        }

        data = await check2fa(totp_token, temp_token);
        if (!data.access_token) {
            return quitAuth('L\'authentification a echoue');
        }
        showBootstrapAlert('Authentification reussie', 'success');
        eraseCookie('temp_token');
        eraseCookie('guest_token');
        setCookie('jwt_token', data);
        updateLoginButton(true);
        urlChange(null, '/home');
    } catch (error) {
        quitAuth("Erreur lors de l'authentification : " + error);
    }
}

export function logout(skipRedirect = false) {
    eraseCookie('temp_token');
    eraseCookie('jwt_token');
    updateLoginButton(false);
    set_statsPanel(null);
    getGuestToken();
    if (!skipRedirect) {
        urlChange(null, '/home');
    }
}

async function ftAPIRequest() {
    return new Promise((resolve, reject) => {
        if (!CLIENT_ID) {
            reject(new Error('CLIENT_ID non configure'));
            return;
        }

        const redirect_addr = 'https://' + window.location.host.split(':')[0] + ':7777/auth/authfortytwo';

        const authUrl = `https://api.intra.42.fr/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect_addr)}&response_type=code`;

        const popup = window.open(authUrl, "auth", `width=600,height=600,left=${(window.screen.width - 600) / 2},top=${(window.screen.height - 600) / 2}`);
        if (!popup) {
            reject(new Error('La popup a ete bloquee par votre navigateur'));
            return;
        }

        const interval = setInterval(() => {
            if (popup.closed) {
                clearInterval(interval);
                if (getCookie('temp_token')) {
                    resolve();
                } else {
                    reject(new Error('Fenetre d\'authentification fermee'));
                }
            }
        }, 500);

        setTimeout(() => {
            if (!popup.closed) {
                popup.close();
            }
            clearInterval(interval);
            reject(new Error('Authentification timeout apres 5 minutes'));
        }, 1000 * 60 * 5);
    });
}

async function ask2FA(temp_token) {
    try {
        let response = await fetch(`https://${window.location.hostname}:7777/auth/oauth/`, {
            method: 'POST',
            body: new URLSearchParams({ "temp_token": temp_token }),
        });
        let data = await response.json();
        return data;
    } catch (error) {
        console.log('Authentication error:', error);
    }
}

async function check2fa(totp_token, temp_token) {
    return new Promise((resolve, reject) => {
        if (!totp_token || !temp_token) {
            reject(new Error('Parametres manquants'));
            return;
        }


        fetch(`https://${window.location.hostname}:7777/auth/2fa/`, {
            method: 'POST',
            body: new URLSearchParams({ totp_token, temp_token }),
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.error) {
                    reject(new Error(data.error));
                } else {
                    resolve(data);
                }
            })
            .catch((error) => reject(error));
    });
}

export function decodeToken(token) {
    try {
        if (!token || typeof token !== 'string') {
            throw new Error('Token invalide');
        }
        const [, payload] = token.split('.');
        const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(normalizedPayload));
    } catch (error) {
        console.log('Token decoding failed:', error);
        return null;
    }
}
