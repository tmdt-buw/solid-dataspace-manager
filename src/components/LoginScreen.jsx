import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faCircleCheck,
  faLock,
  faRightFromBracket,
  faUserPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import "../LoginScreen.css";
import LoginParticleCloud from "./LoginParticleCloud";
import { getBranding, getEnabledProviders } from "../config/runtimeConfig";
import {
  clearStoredAccountToken,
  clearRememberedAccountLogin,
  createAccount,
  createPasswordLogin,
  createPod,
  getOriginUrl,
  getAccountIndexUrl,
  loadAccountDetails,
  loadAccountIndex,
  loginWithPassword,
  readRememberedAccountLogin,
  resolveAccountCreateUrl,
  resolvePasswordCreateUrl,
  resolvePasswordLoginUrl,
  resolvePodCreateUrl,
  storeRememberedAccountLogin,
  storeAccountToken,
} from "../cssAccountApi";

export default function LoginScreen({ onLogin }) {
  const providers = getEnabledProviders();
  const branding = getBranding();

  const [selected, setSelected] = useState(providers[0]?.issuer || "");
  const [customIssuer, setCustomIssuer] = useState("");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authIssuer, setAuthIssuer] = useState("");
  const [accountIndexUrl, setAccountIndexUrl] = useState("");
  const [accountControls, setAccountControls] = useState({});
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountRemember, setAccountRemember] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registerStep, setRegisterStep] = useState(1);
  const [registerIssuer, setRegisterIssuer] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [registerPodName, setRegisterPodName] = useState("");
  const [registerRemember, setRegisterRemember] = useState(true);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerProgress, setRegisterProgress] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerResult, setRegisterResult] = useState({
    podUrl: "",
    webId: "",
  });

  const useCustom = customIssuer.trim().length > 0;
  const issuerToLogin = useCustom ? customIssuer.trim() : selected;
  const registerIssuerOrigin = getOriginUrl(registerIssuer || issuerToLogin);
  const registerPodNameValue = registerPodName.trim();
  const registerPodPreview =
    registerIssuerOrigin && registerPodNameValue
      ? `${registerIssuerOrigin}/${registerPodNameValue}/`
      : "";

  const resetRegisterWizard = (issuer = "") => {
    setRegisterStep(1);
    setRegisterIssuer(issuer);
    setRegisterEmail("");
    setRegisterPassword("");
    setRegisterPasswordConfirm("");
    setRegisterPodName("");
    setRegisterRemember(true);
    setRegisterLoading(false);
    setRegisterProgress("");
    setRegisterError("");
    setRegisterResult({ podUrl: "", webId: "" });
  };

  const loadAccountControlsForIssuer = async (issuer) => {
    const indexUrl = getAccountIndexUrl(issuer);
    if (!indexUrl) {
      throw new Error("No account API URL could be derived from this provider.");
    }

    setAccountIndexUrl(indexUrl);
    const index = await loadAccountIndex(indexUrl);
    setAccountControls(index.controls);
  };

  const openAccountLoginFlow = async () => {
    if (!issuerToLogin) return;

    const nextIssuer = issuerToLogin;
    const nextAccountIndexUrl = getAccountIndexUrl(nextIssuer);
    const rememberedLogin = readRememberedAccountLogin(nextAccountIndexUrl);
    clearStoredAccountToken(nextAccountIndexUrl);

    setAuthModalOpen(true);
    setAuthIssuer(nextIssuer);
    setAuthError("");
    setAccountEmail(rememberedLogin.email);
    setAccountPassword("");
    setAccountRemember(Boolean(rememberedLogin.email));
    setAuthLoading(true);

    try {
      await loadAccountControlsForIssuer(nextIssuer);
    } catch (err) {
      setAuthError(err?.message || "Account login could not be initialized.");
    } finally {
      setAuthLoading(false);
    }
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
    setAuthError("");
    setAccountPassword("");
  };

  const openRegisterWizard = () => {
    if (!issuerToLogin) return;
    resetRegisterWizard(issuerToLogin);
    setRegisterModalOpen(true);
  };

  const closeRegisterWizard = () => {
    if (registerLoading) return;
    setRegisterModalOpen(false);
    resetRegisterWizard();
  };

  const validateRegisterAccountStep = () => {
    if (!registerEmail.trim()) {
      setRegisterError("Email is required.");
      return false;
    }

    if (!registerPassword || !registerPasswordConfirm) {
      setRegisterError("Password and confirmation are required.");
      return false;
    }

    if (registerPassword !== registerPasswordConfirm) {
      setRegisterError("Passwords do not match.");
      return false;
    }

    return true;
  };

  const validateRegisterPodStep = () => {
    if (!registerPodNameValue) {
      setRegisterError("Pod name is required.");
      return false;
    }

    if (!/^[a-z0-9][a-z0-9_-]*$/.test(registerPodNameValue)) {
      setRegisterError(
        "Pod name can use lowercase letters, numbers, dashes, and underscores."
      );
      return false;
    }

    return true;
  };

  const goToRegisterPodStep = () => {
    setRegisterError("");
    if (validateRegisterAccountStep()) {
      setRegisterStep(2);
    }
  };

  const getRegisteredPodUrl = (podResponse, details) => {
    const detailPod = details?.pods?.find((pod) =>
      pod.podUrl?.includes(`/${registerPodNameValue}/`)
    );
    const responseCandidates = [
      podResponse?.baseUrl,
      podResponse?.podUrl,
      podResponse?.pod,
      podResponse?.url,
      podResponse?.location,
    ].filter((candidate) => candidate && !candidate.includes("/.account/"));
    const fallbackPodUrl = registerPodPreview;

    return detailPod?.podUrl || responseCandidates[0] || fallbackPodUrl;
  };

  const getRegisteredWebId = (details) => {
    const matchingWebId = details?.webIds?.find((item) =>
      item.webId?.includes(`/${registerPodNameValue}/`)
    );

    return matchingWebId?.webId || "";
  };

  const submitRegistration = async (event) => {
    event.preventDefault();
    setRegisterError("");

    if (!validateRegisterAccountStep() || !validateRegisterPodStep()) {
      return;
    }

    try {
      setRegisterLoading(true);

      const accountIndex = getAccountIndexUrl(registerIssuer);
      if (!accountIndex) {
        throw new Error("No account API URL could be derived from this provider.");
      }

      setRegisterProgress("Loading provider account API...");
      const publicIndex = await loadAccountIndex(accountIndex);
      const accountCreateUrl = resolveAccountCreateUrl(publicIndex.controls, accountIndex);
      if (!accountCreateUrl) {
        throw new Error("This provider does not expose account registration.");
      }

      setRegisterProgress("Creating account...");
      const accountCreation = await createAccount(accountCreateUrl);
      const accountToken = accountCreation.authorization;
      if (!accountToken) {
        throw new Error("The provider created no account token.");
      }

      setRegisterProgress("Preparing account controls...");
      const authorizedIndex = await loadAccountIndex(accountIndex, accountToken);
      const passwordCreateUrl = resolvePasswordCreateUrl(authorizedIndex.controls);
      const podCreateUrl = resolvePodCreateUrl(authorizedIndex.controls);

      if (!passwordCreateUrl) {
        throw new Error("This provider does not expose email/password creation.");
      }

      if (!podCreateUrl) {
        throw new Error("This provider does not expose pod creation.");
      }

      setRegisterProgress("Adding email/password login...");
      await createPasswordLogin(
        passwordCreateUrl,
        {
          email: registerEmail.trim(),
          password: registerPassword,
        },
        accountToken
      );

      setRegisterProgress("Creating Solid Pod...");
      const podResponse = await createPod(
        podCreateUrl,
        {
          name: registerPodNameValue,
        },
        accountToken
      );

      setRegisterProgress("Loading created account details...");
      const refreshedIndex = await loadAccountIndex(accountIndex, accountToken);
      const details = refreshedIndex.authorized
        ? await loadAccountDetails(refreshedIndex.controls, accountToken)
        : null;

      storeAccountToken(accountIndex, accountToken, { remember: registerRemember });
      const podUrl = getRegisteredPodUrl(podResponse, details);
      setRegisterResult({
        podUrl,
        webId: getRegisteredWebId(details) || (podUrl ? `${podUrl}profile/card#me` : ""),
      });
      setRegisterPassword("");
      setRegisterPasswordConfirm("");
      setRegisterProgress("");
      setRegisterStep(3);
    } catch (err) {
      setRegisterError(err?.message || "Registration failed.");
    } finally {
      setRegisterLoading(false);
    }
  };

  const continueAfterRegistration = () => {
    const issuer = registerIssuer;
    setRegisterModalOpen(false);
    resetRegisterWizard();
    onLogin(issuer);
  };

  const submitAccountLogin = async (event) => {
    event.preventDefault();
    setAuthError("");

    const email = accountEmail.trim();

    if (!email || !accountPassword) {
      setAuthError("Email and password are required.");
      return;
    }

    const loginUrl = resolvePasswordLoginUrl(accountControls, accountIndexUrl);
    if (!loginUrl) {
      setAuthError("No account login endpoint is available.");
      return;
    }

    try {
      setAuthLoading(true);
      const token = await loginWithPassword(loginUrl, {
        email,
        password: accountPassword,
        remember: false,
      });

      if (!token) {
        throw new Error("The provider login returned no account token.");
      }

      storeAccountToken(accountIndexUrl, token, { remember: false });
      if (accountRemember) {
        storeRememberedAccountLogin(accountIndexUrl, { email });
      } else {
        clearRememberedAccountLogin(accountIndexUrl);
      }

      setAccountPassword("");
      setAuthModalOpen(false);
      onLogin(authIssuer);
    } catch (err) {
      setAuthError(err?.message || "Account login failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-wrap">
        <div className="login-hero">
          <div className="login-hero-left">
            <div className="login-hero-icon">
              <FontAwesomeIcon icon={faLock} />
            </div>
            <div>
              <div className="login-hero-title">Solid Dataspace</div>
            </div>
          </div>
          {branding.logoUrl ? (
            <img
              className="login-hero-logo"
              src={branding.logoUrl}
              alt={branding.logoAlt || "Project Logo"}
              style={branding.logoStyle}
            />
          ) : null}
        </div>

        <LoginParticleCloud />

        <div className="login-card">
          <div className="login-section">
            <div className="section-head">
              <span className="section-title">Suggested providers</span>
            </div>

            <div className="provider-grid">
              {providers.map((provider) => {
                const isActive = selected === provider.issuer && !useCustom;

                return (
                  <button
                    key={provider.id}
                    type="button"
                    className={"prov-card" + (isActive ? " active" : "")}
                    onClick={() => {
                      setSelected(provider.issuer);
                      setCustomIssuer("");
                    }}
                    title={provider.issuer}
                  >
                    <span className={"radio" + (isActive ? " on" : "")} aria-hidden />
                    <div className="prov-text">
                      <div className="prov-label">{provider.label}</div>
                      <div className="prov-url">{provider.issuer}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="login-section">
            <div className="section-head">
              <span className="section-title">Custom issuer</span>
            </div>

            <div className="custom-row">
              <input
                className="custom-input"
                placeholder="https://your-pod-provider.example"
                value={customIssuer}
                onChange={(e) => setCustomIssuer(e.target.value)}
              />

              {useCustom && (
                <button
                  type="button"
                  className="clear-btn"
                  onClick={() => setCustomIssuer("")}
                  title="Back to provider list"
                >
                  x
                </button>
              )}
            </div>
          </div>

          <div className="login-footer">
            <button
              type="button"
              className="login-secondary"
              onClick={openRegisterWizard}
              disabled={!issuerToLogin || authLoading || registerLoading}
              title="Register on selected provider"
            >
              <FontAwesomeIcon icon={faUserPlus} />
              <span>Register</span>
            </button>
            <button
              type="button"
              className="login-primary"
              onClick={openAccountLoginFlow}
              disabled={!issuerToLogin || authLoading}
              title="Log in with selected provider"
            >
              <FontAwesomeIcon icon={faRightFromBracket} />
              <span>{authLoading && !authModalOpen ? "Checking..." : "Login"}</span>
            </button>
          </div>
        </div>
      </div>

      {authModalOpen ? (
        <div className="login-modalOverlay" role="presentation">
          <div
            className="login-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
          >
            <div className="login-modal__head">
              <div>
                <div className="login-modal__eyebrow">
                  Solid Provider
                </div>
                <h2 id="login-modal-title">Account login</h2>
              </div>
              <button
                type="button"
                className="login-modal__close"
                onClick={closeAuthModal}
                aria-label="Close"
                title="Close"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form className="login-accountForm" onSubmit={submitAccountLogin}>
              <p className="login-modal__copy">
                Sign in to the Solid Provider.
              </p>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={accountEmail}
                  onChange={(event) => setAccountEmail(event.target.value)}
                  autoComplete="username"
                  placeholder="name@example.org"
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  value={accountPassword}
                  onChange={(event) => setAccountPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Password"
                />
              </label>
              <label className="login-accountForm__check">
                <input
                  type="checkbox"
                  checked={accountRemember}
                  onChange={(event) => setAccountRemember(event.target.checked)}
                />
                <span>Remember me</span>
              </label>
              {authError ? <div className="login-modal__error">{authError}</div> : null}
              <div className="login-modal__actions">
                <button className="login-primary" type="submit" disabled={authLoading}>
                  <FontAwesomeIcon icon={faRightFromBracket} />
                  <span>{authLoading ? "Signing in..." : "Continue"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {registerModalOpen ? (
        <div className="login-modalOverlay" role="presentation">
          <div
            className="login-modal login-registerModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-modal-title"
          >
            <div className="login-modal__head">
              <div>
                <div className="login-modal__eyebrow">
                  {registerIssuer || "Solid Provider"}
                </div>
                <h2 id="register-modal-title">Register Solid account</h2>
              </div>
              <button
                type="button"
                className="login-modal__close"
                onClick={closeRegisterWizard}
                aria-label="Close"
                title="Close"
                disabled={registerLoading}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form className="login-registerForm" onSubmit={submitRegistration}>
              <div className="login-registerSteps" aria-label="Registration steps">
                {[
                  { id: 1, label: "Account" },
                  { id: 2, label: "Pod" },
                  { id: 3, label: "Done" },
                ].map((step) => (
                  <div
                    key={step.id}
                    className={
                      "login-registerStep" +
                      (registerStep === step.id ? " active" : "") +
                      (registerStep > step.id ? " complete" : "")
                    }
                  >
                    <span>{registerStep > step.id ? <FontAwesomeIcon icon={faCircleCheck} /> : step.id}</span>
                    <strong>{step.label}</strong>
                  </div>
                ))}
              </div>

              {registerStep === 1 ? (
                <div className="login-registerPanel">
                  <p className="login-modal__copy">
                    Create an account on the selected Solid Community Server.
                  </p>
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={(event) => setRegisterEmail(event.target.value)}
                      autoComplete="username"
                      placeholder="name@example.org"
                    />
                  </label>
                  <label>
                    <span>Password</span>
                    <input
                      type="password"
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                      autoComplete="new-password"
                      placeholder="Password"
                    />
                  </label>
                  <label>
                    <span>Confirm password</span>
                    <input
                      type="password"
                      value={registerPasswordConfirm}
                      onChange={(event) =>
                        setRegisterPasswordConfirm(event.target.value)
                      }
                      autoComplete="new-password"
                      placeholder="Confirm password"
                    />
                  </label>
                  <label className="login-accountForm__check">
                    <input
                      type="checkbox"
                      checked={registerRemember}
                      onChange={(event) =>
                        setRegisterRemember(event.target.checked)
                      }
                    />
                    <span>Remember account login</span>
                  </label>
                </div>
              ) : null}

              {registerStep === 2 ? (
                <div className="login-registerPanel">
                  <p className="login-modal__copy">
                    Choose the pod name that will be created for this account.
                  </p>
                  <label>
                    <span>Pod name</span>
                    <input
                      type="text"
                      value={registerPodName}
                      onChange={(event) => setRegisterPodName(event.target.value)}
                      autoComplete="off"
                      placeholder="my-pod"
                    />
                  </label>
                  {registerPodPreview ? (
                    <div className="login-registerPreview">
                      <span>Pod URL</span>
                      <strong>{registerPodPreview}</strong>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {registerStep === 3 ? (
                <div className="login-registerPanel login-registerDone">
                  <FontAwesomeIcon icon={faCircleCheck} />
                  <div>
                    <h3>Account and pod created</h3>
                    <p>
                      You can continue to the Solid provider authorization screen
                      and sign in with the WebID from the new pod.
                    </p>
                  </div>
                  {registerResult.podUrl ? (
                    <div className="login-registerResult">
                      <span>Pod URL</span>
                      <a href={registerResult.podUrl} target="_blank" rel="noreferrer">
                        {registerResult.podUrl}
                      </a>
                    </div>
                  ) : null}
                  {registerResult.webId ? (
                    <div className="login-registerResult">
                      <span>WebID</span>
                      <a href={registerResult.webId} target="_blank" rel="noreferrer">
                        {registerResult.webId}
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {registerProgress ? (
                <div className="login-registerProgress">{registerProgress}</div>
              ) : null}
              {registerError ? (
                <div className="login-modal__error">{registerError}</div>
              ) : null}

              <div className="login-modal__actions">
                {registerStep === 2 ? (
                  <button
                    className="login-secondary"
                    type="button"
                    onClick={() => {
                      setRegisterError("");
                      setRegisterStep(1);
                    }}
                    disabled={registerLoading}
                  >
                    Back
                  </button>
                ) : null}
                {registerStep === 1 ? (
                  <button
                    className="login-primary"
                    type="button"
                    onClick={goToRegisterPodStep}
                  >
                    <span>Next</span>
                    <FontAwesomeIcon icon={faArrowRight} />
                  </button>
                ) : null}
                {registerStep === 2 ? (
                  <button
                    className="login-primary"
                    type="submit"
                    disabled={registerLoading}
                  >
                    <FontAwesomeIcon icon={faUserPlus} />
                    <span>
                      {registerLoading ? "Creating..." : "Create account and pod"}
                    </span>
                  </button>
                ) : null}
                {registerStep === 3 ? (
                  <button
                    className="login-primary"
                    type="button"
                    onClick={continueAfterRegistration}
                  >
                    <FontAwesomeIcon icon={faRightFromBracket} />
                    <span>Continue to Login</span>
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
