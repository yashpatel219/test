import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const navigate = useNavigate();
  const loginInProgress = useRef(false);
  const googleInitialized = useRef(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  // -------------------- SESSION HANDLING --------------------
  const clearSession = useCallback(() => {
    [
      "sessionExpiry",
      "userData",
      "email",
      "name",
      "username",
      "userId",
      "avatar",
      "role",
      "quizStatus",
      "isNewUser",
      "hasSeenTour",
      "googleUser",
      "generatedAt",
      "internshipStartDate",
    ].forEach((key) => localStorage.removeItem(key));

    setIsLoggedIn(false);
  }, []);

  const setSession = useCallback((userData) => {
    const now = Date.now();
    const expiryTime = now + 45 * 24 * 60 * 60 * 1000; // 45 days
    localStorage.setItem("sessionExpiry", expiryTime.toString());
    localStorage.setItem("userData", JSON.stringify(userData));
    setIsLoggedIn(true);
  }, []);

  const redirectUserBasedOnRole = useCallback(
    (role) => {
      if (role === "Volunteer_Internal") navigate("/volunteerDashboard");
      else navigate("/dashboard");
    },
    [navigate]
  );

  const parseJwt = useCallback((token) => {
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }, []);

  // -------------------- GOOGLE LOGIN HANDLER --------------------
  const handleCredentialResponse = useCallback(
    async (response) => {
      if (loginInProgress.current) return;
      loginInProgress.current = true;

      setLoading(true);
      setLoadingMessage("Signing you in...");

      try {
        const decoded = parseJwt(response.credential);
        if (!decoded) throw new Error("Failed to decode JWT");

        const email = decoded.email;
        const googleUser = {
          name: decoded.name,
          email,
          avatar: decoded.picture,
        };
        localStorage.setItem("googleUser", JSON.stringify(googleUser));

        // Check if user exists
        const checkRes = await fetch(
          "https://donate.unessafoundation.org/api/users/check-user",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          }
        );

        const userExists = checkRes.ok && (await checkRes.json()).exists;

        const role = userExists ? (await fetch(
          `https://donate.unessafoundation.org/api/users/get-user/${email}`
        ).then((r) => r.json())).role : "Fundraiser_External";

        const userData = {
          email,
          name: decoded.name,
          role,
          avatar: decoded.picture,
        };

        // Save session
        setSession(userData);

        // Save additional info
        localStorage.setItem("email", email);
        localStorage.setItem("name", decoded.name);
        localStorage.setItem("avatar", decoded.picture);
        localStorage.setItem("role", role);

        // Navigate
        if (!userExists) navigate("/name");
        else redirectUserBasedOnRole(role);
      } catch (err) {
        console.error("Google login error:", err);
      } finally {
        loginInProgress.current = false;
        setLoading(false);
      }
    },
    [parseJwt, setSession, navigate, redirectUserBasedOnRole]
  );

  // -------------------- GOOGLE SCRIPT INITIALIZATION --------------------
  useEffect(() => {
    if (isLoggedIn) return;

    const loadGoogleScript = () => {
      if (window.google?.accounts?.id) return initializeGoogle();

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogle;
      script.onerror = () => console.error("Failed to load Google API");
      document.body.appendChild(script);
    };

    const initializeGoogle = () => {
      if (googleInitialized.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id:
          "576101733937-te217ttgfveqn2jk9misk91d2po77p64.apps.googleusercontent.com",
        callback: handleCredentialResponse,
        context: "signin",
      });
      window.google.accounts.id.renderButton(
        document.getElementById("googleSignInDiv"),
        { theme: "outline", size: "large", width: 300 }
      );
      googleInitialized.current = true;
    };

    loadGoogleScript();
  }, [handleCredentialResponse, isLoggedIn]);

  // -------------------- RENDER --------------------
  if (isLoggedIn) {
    return (
      <div className="h-screen flex justify-center items-center bg-[#F4F9F8]">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Welcome Back!</h1>
          <button
            className="mt-4 px-6 py-2 bg-red-500 text-white rounded-md"
            onClick={() => {
              clearSession();
              window.location.reload();
            }}
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex justify-center items-center bg-[#F4F9F8] relative">
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-80 flex flex-col justify-center items-center z-50">
          <div className="animate-spin h-16 w-16 border-4 border-t-[#10B981] border-b-transparent rounded-full"></div>
          <p className="mt-4 text-lg text-gray-700">{loadingMessage}</p>
        </div>
      )}

      <div className="text-center scale-[1.2]">
        <h1 className="text-4xl font-bold text-[#333]">Welcome to Unessa Foundation</h1>
        <div id="googleSignInDiv" className="mt-5 flex justify-center"></div>
      </div>
    </div>
  );
};

export default Login;
