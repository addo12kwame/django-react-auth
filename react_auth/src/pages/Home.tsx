function Home(props: { name: string }) {

    return (
      <div>
        {props["name"] ? (
          <div className="card bg-primary text-black" style={{ width: "18rem" }}>
            <img
              src="https://kwamesbucket.s3.us-east-1.amazonaws.com/rocket.png"
              className="card-img-top rounded mx-auto d-block"
              alt="logo"
            />
  
            <div className="card-body">
              <h5 className="card-title">Welcome {props["name"]}</h5>
  
              <p className="card-text">
                You have been authenticated for this website
              </p>
              <a href="https://github.com/addo12kwame" className="btn btn-dark">
                Go to my github
              </a>
            </div>
          </div>
        ) : (
          <p className='text-white fs-1 badge text-bg-primary text-wrap" style="width: 6rem;'>
            You are not logged in
          </p>
        )}
      </div>
    );
  }
  
  export default Home;
  