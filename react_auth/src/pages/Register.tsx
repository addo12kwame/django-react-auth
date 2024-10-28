import React, { SyntheticEvent, useState } from "react";
import { Navigate } from "react-router-dom";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [redirected, setRedirected] = useState(false);

  let statusCode;

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();

    const response = await fetch("http://localhost:8000/api/register/", {
      method: "POST",
      headers: { "content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const content = await response.json();
    if (response.status === 200) {
      setRedirected(true);
      alert("Account Created");
      return;
    }
    alert("Email exists");
  };

  if (redirected) {
    return <Navigate to="/login" />;
  }

  return (
    <form onSubmit={submit}>
      <h1 className="h3 mb-3 fw-normal text-white text-center border">
        SIGN UP
      </h1>

      <div className="form-floating">
        <input
          type="text"
          className="form-control"
          id="floatingPassword"
          placeholder="name"
          required
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor="floatingInput">Name</label>
      </div>
      <div className="form-floating">
        <input
          type="email"
          className="form-control"
          id="floatingInput"
          placeholder="name@example.com"
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="floatingInput">Email address</label>
      </div>
      <div className="form-floating">
        <input
          type="password"
          className="form-control"
          id="floatingPassword"
          placeholder="Password"
          required
          onChange={(e) => setPassword(e.target.value)}
        />
        <label htmlFor="floatingPassword">Password</label>
      </div>
      <button className="btn btn-primary    w-100 py-2" type="submit">
        Sign Up
      </button>
    </form>
  );
}

export default Register;
