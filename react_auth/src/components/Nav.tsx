
import { Link } from "react-router-dom";


function Nav(props: { name: string; setName: (name: string) => void }) {
  const logout = async () => {
    const response = await fetch("http://localhost:8000/api/logout/", {
      method: "POST",
      headers: { "content-Type": "application/json" },
      credentials: "include",
    });

    props.setName("");
  };

  let menu;

  if (!props.name || props.name === "") {
    console.log(props["name"]);
    menu = (
      <ul className="navbar-nav me-auto mb-2 mb-md-0 ">
        <li className="nav-item active">
          <Link className="nav-link" aria-current="page" to="/login">
            Login
          </Link>
        </li>
        <li className="nav-item active">
          <Link className="nav-link" aria-current="page" to="/register">
            Register
          </Link>
        </li>
      </ul>
    );
  } else {
    console.log(` from logout ${props["name"]})`);
    menu = (
      <ul className="navbar-nav me-auto mb-2 mb-md-0 ">
        <li className="nav-item active">
          <Link
            className="nav-link"
            aria-current="page"
            to="/login"
            onClick={logout}
          >
            Logout
          </Link>
        </li>
      </ul>
    );
  }

  return (
    <nav className="navbar navbar-expand-md navbar-dark bg-dark mb-4">
      <div className="container-fluid">
        <Link className="navbar-brand" to="/">
          Authentication
        </Link>

        <div>{menu}</div>
      </div>
    </nav>
  );
}

export default Nav;
