# Security and privacy

Images and project files are untrusted inputs. The app validates settings and file sizes, restricts project images to embedded PNG/JPEG/WebP data, and does not evaluate imported JavaScript or insert imported markup into the document.

There is no server, login, upload endpoint, secret, or telemetry. Image decoding uses browser APIs. Saved presets live in local storage. Settings links may expose your chosen settings to anyone receiving the link; `.d4a` files include the source image.

Report a security issue privately through [GitHub private vulnerability reporting](https://github.com/Gorskiz/Dither4All/security/advisories/new). Please do not attach sensitive images to public issues.

If you host a modified version, disclose any network services or tracking you add. A static host will still log ordinary requests for the application assets.
