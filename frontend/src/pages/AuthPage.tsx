import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Sprout,
  Tractor,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ApiError, errorMessage } from "@/lib/api";
import { Button, SelectInput, TextInput } from "@/components/FarmUI";

const heroImage = "/images/farmer-hero.jpg";
export function AuthPage({
  mode = "login",
  role = "farmer",
}: {
  mode?: "login" | "register";
  role?: "farmer" | "buyer";
}) {
  const { user, loading: authLoading, login, register } = useAuth();
  const { language } = useLanguage();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  const isRegister = mode === "register";
  const isBuyer = role === "buyer";

  useEffect(() => {
    if (!authLoading && user)
      setLocation(user.role === "buyer" ? "/buyer" : "/farmer");
  }, [user, authLoading, setLocation]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    if (isRegister && password !== confirm) {
      setFormError("The passwords don't match yet.");
      return;
    }
    if (password.length < (isRegister ? 10 : 1)) {
      setFormError(
        isRegister
          ? "Use at least 10 characters for your password."
          : "Enter your password to continue."
      );
      return;
    }
    const phoneDigits = phone.trim().replace(/\D/g, "");
    if (
      isRegister &&
      !isBuyer &&
      (!/^\+?[0-9 ()-]+$/.test(phone.trim()) ||
        phoneDigits.length < 7 ||
        phoneDigits.length > 15)
    ) {
      setFormError("Enter a valid phone number with 7 to 15 digits.");
      return;
    }
    if (
      isRegister &&
      !isBuyer &&
      (!age || Number(age) < 1 || Number(age) > 120)
    ) {
      setFormError("Enter an age between 1 and 120.");
      return;
    }
    if (isRegister && !isBuyer && !gender) {
      setFormError("Choose a gender option, including ‘Prefer not to say’.");
      return;
    }
    setPending(true);
    try {
      if (isRegister) {
        const created = await register(
          {
            full_name: name.trim(),
            email: email.trim(),
            password,
            role,
            preferred_language: language,
            ...(phone.trim() ? { phone: phone.trim() } : {}),
            ...(!isBuyer ? { age: Number(age), gender } : {}),
            ...(isBuyer && businessName.trim()
              ? { business_name: businessName.trim() }
              : {}),
          },
          password
        );
        toast.success("Your FarmSaathi account is ready.");
        setLocation(
          created.role === "buyer"
            ? "/buyer/profile?setup=1"
            : "/farmer/profile?setup=1"
        );
      } else {
        const signedIn = await login(email.trim(), password);
        toast.success(`Welcome back, ${signedIn.full_name.split(" ")[0]}.`);
        setLocation(signedIn.role === "buyer" ? "/buyer" : "/farmer");
      }
    } catch (error) {
      const message = errorMessage(error);
      setFormError(
        error instanceof ApiError && error.status === 401
          ? "That email and password don't match. Check them and try again."
          : message
      );
    } finally {
      setPending(false);
    }
  }

  const forgotPassword = () =>
    toast.info(
      "Password recovery is not available because the connected API has no password-reset endpoint yet."
    );
  return (
    <div className="auth-page">
      <section
        className="auth-visual"
        style={{
          backgroundImage: `linear-gradient(145deg, rgba(17,49,34,.32), rgba(14,44,31,.9)), url('${heroImage}')`,
        }}
      >
        <div className="auth-visual-grain" />
        <Link href="/" className="auth-brand" data-no-translate="true">
          <span className="brand-mark brand-mark-light">
            <Sprout size={22} />
          </span>
          <span>
            Farm<span>AI</span>
          </span>
        </Link>
        <div className="auth-story">
          <div className="auth-kicker">
            <span className="kicker-line" /> AGRICULTURE, WITH MORE CLARITY
          </div>
          <h1>
            Good decisions
            <br />
            start <em>with the soil.</em>
          </h1>
          <p>
            Bring your fields, crop records and marketplace together in one calm
            workspace.
          </p>
          <div className="auth-proof">
            <div className="proof-icon">
              <Tractor size={18} />
            </div>
            <span>
              Built for the decisions
              <br />
              you make every day.
            </span>
          </div>
        </div>
        <div className="auth-visual-caption">
          <span>FIELD NOTES · 01</span>
          <span>Made for the hands that grow.</span>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-topline">
          <span>
            {isRegister
              ? "A growing network starts here"
              : "Your farm, in focus"}
          </span>
          <div className="auth-topline-actions"><LanguageSwitcher /><span className="auth-secure"><LockKeyhole size={14} /> Secure sign in</span></div>
        </div>
        <div className="auth-form-wrap">
          <Link href={isRegister ? "/login" : "/"} className="auth-back">
            <ArrowLeft size={15} />{" "}
            {isRegister ? "Back to sign in" : "Back to home"}
          </Link>
          <div className="auth-headline">
            <div className="auth-icon">
              <Leaf size={19} />
            </div>
            <div className="eyebrow">
              {isRegister
                ? `JOIN AS A ${isBuyer ? "BUYER" : "FARMER"}`
                : "WELCOME BACK"}
            </div>
            <h2>{isRegister ? "Let's grow together." : "Good to see you."}</h2>
            <p>
              {isRegister
                ? "Create your account to bring your next season into focus."
                : "Sign in to pick up where your farm left off."}
            </p>
          </div>
          {isRegister && (
            <div className="role-switch" aria-label="Choose account type">
              <Link
                href="/register/farmer"
                className={!isBuyer ? "selected" : ""}
              >
                <Sprout size={16} /> Farmer
              </Link>
              <Link
                href="/register/buyer"
                className={isBuyer ? "selected" : ""}
              >
                <Leaf size={16} /> Buyer
              </Link>
            </div>
          )}
          <form className="auth-form" onSubmit={submit} noValidate>
            {isRegister && (
              <TextInput
                label="Your name"
                id="full_name"
                placeholder="e.g. Ananya Rao"
                autoComplete="name"
                required
                value={name}
                onChange={event => setName(event.target.value)}
              />
            )}
            {isRegister && isBuyer && (
              <TextInput
                label="Business name"
                id="business_name"
                placeholder="Optional"
                autoComplete="organization"
                value={businessName}
                onChange={event => setBusinessName(event.target.value)}
              />
            )}
            <TextInput
              label="Email address"
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
            {isRegister && (
              <TextInput
                label="Phone number"
                id="phone"
                type="tel"
                placeholder={isBuyer ? "Optional" : "+91 98765 43210"}
                autoComplete="tel"
                required={!isBuyer}
                inputMode="tel"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                hint={
                  isBuyer ? undefined : "Required · include your country code"
                }
              />
            )}
            {isRegister && !isBuyer && (
              <>
                <TextInput
                  label="Age"
                  id="age"
                  type="number"
                  placeholder="Enter your age"
                  autoComplete="off"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  required
                  value={age}
                  onChange={event => setAge(event.target.value)}
                  hint="Required"
                />
                <SelectInput
                  label="Gender"
                  id="gender"
                  required
                  value={gender}
                  onChange={event => setGender(event.target.value)}
                  options={[
                    { value: "female", label: "Female" },
                    { value: "male", label: "Male" },
                    { value: "non_binary", label: "Non-binary" },
                    { value: "other", label: "Other" },
                    { value: "prefer_not_to_say", label: "Prefer not to say" },
                  ]}
                />
                <p className="field-note">
                  Choose “Prefer not to say” if you do not wish to disclose.
                </p>
              </>
            )}
            <div className="form-field">
              <div className="password-label-row">
                <label className="field-label" htmlFor="password">
                  Password <span className="required-dot">*</span>
                </label>
                {!isRegister && (
                  <button
                    type="button"
                    className="text-button password-help"
                    onClick={forgotPassword}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="password-wrap">
                <input
                  id="password"
                  className="text-input"
                  type={visible ? "text" : "password"}
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                  placeholder={
                    isRegister
                      ? "At least 10 characters"
                      : "Enter your password"
                  }
                  required
                  minLength={isRegister ? 10 : 1}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setVisible(!visible)}
                  aria-label={visible ? "Hide password" : "Show password"}
                >
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {isRegister && (
              <TextInput
                label="Confirm password"
                id="confirm_password"
                type={visible ? "text" : "password"}
                placeholder="Enter your password again"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={event => setConfirm(event.target.value)}
              />
            )}
            {formError && (
              <div className="form-alert" role="alert">
                {formError}
              </div>
            )}
            <Button
              type="submit"
              className="auth-submit"
              disabled={
                pending ||
                !email ||
                !password ||
                (isRegister &&
                  (!name ||
                    !confirm ||
                    (!isBuyer && (!phone || !age || !gender))))
              }
            >
              {pending ? (
                <>
                  <LoaderCircle className="spin" size={18} />{" "}
                  {isRegister ? "Creating your account…" : "Signing in…"}
                </>
              ) : (
                <>
                  {isRegister ? "Create account" : "Sign in"}
                  <ArrowRight size={17} />
                </>
              )}
            </Button>
          </form>
          <div className="auth-divider">
            <span /> or <span />
          </div>
          <p className="auth-switch">
            {isRegister ? "Already have a FarmSaathi account?" : "New to FarmSaathi?"}{" "}
            <Link href={isRegister ? "/login" : "/register/farmer"}>
              {isRegister ? "Sign in" : "Create an account"}
            </Link>
          </p>
          {!isRegister && (
            <div className="auth-role-links">
              <Link href="/register/farmer">
                <Sprout size={15} /> Farmer registration
              </Link>
              <Link href="/register/buyer">
                <Leaf size={15} /> Buyer registration
              </Link>
            </div>
          )}
          <div className="auth-footnote">
            <MapPin size={14} />
            <span>
              Your data stays with your account. FarmSaathi does not invent crop,
              weather or market facts.
            </span>
          </div>
        </div>
        <div className="auth-legal">
          By continuing, you agree to our{" "}
          <a
            href="#terms"
            onClick={event => {
              event.preventDefault();
              toast.info("Terms and privacy pages are not configured yet.");
            }}
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href="#privacy"
            onClick={event => {
              event.preventDefault();
              toast.info("Terms and privacy pages are not configured yet.");
            }}
          >
            Privacy Policy
          </a>
          .
        </div>
      </section>
    </div>
  );
}
