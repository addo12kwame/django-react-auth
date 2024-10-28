import React, { useEffect, useState } from "react";
import "./App.css";
import Login from "./pages/Login";
import Nav from "./components/Nav";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Register from "./pages/Register";

function App() {
  const [name, setName] = useState("");
  useEffect(() => {
    (async () => {
      const response = await fetch("http://localhost:8000/api/user/", {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // to get the cookie we need to set credentials to include
      });
      const content = await response.json();
      setName(content["name"]);
      console.log(`name in app.tsx ${content.name}`);
    })();
  });

  return (
    <div className="app">
      <BrowserRouter>
        <Nav name={name} setName={setName} />
        <main className="form-signin w-100 m-auto">
          <Routes>
            <Route path="/" Component={() => <Home name={name} />} />
            <Route
              path="/login"
              Component={() => <Login name={name} setName={setName} />}
            />
            <Route path="/register" Component={Register} />
          </Routes>
        </main>
      </BrowserRouter>
    </div>
  );
}

export default App;
