/**
 * Nebula Browser - Service Worker Registration
 * Registers the UV service worker and validates the environment.
 */
"use strict";

const stockSW = "/uv/sw.js";

// Hostnames allowed to run service workers on insecure http://
const swAllowedHostnames = ["localhost", "127.0.0.1"];

/**
 * Register the Ultraviolet service worker.
 * Throws descriptive errors if the environment doesn't support it.
 */
async function registerSW() {
    if (!navigator.serviceWorker) {
        if (
            location.protocol !== "https:" &&
            !swAllowedHostnames.includes(location.hostname)
        ) {
            throw new Error(
                "Service workers require HTTPS. Use localhost for local development."
            );
        }
        throw new Error("Your browser doesn't support service workers.");
    }
    await navigator.serviceWorker.register(stockSW);
}
