const API_URL = "https://jsonplaceholder.typicode.com/users";

const loadButton = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

let users = [];

async function loadUsers() {
  loadButton.disabled = true;
  statusText.textContent = "Loading users...";

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error("Request failed with status " + response.status);
    }

    users = await response.json();
    renderUsers(users);
    statusText.textContent = "Loaded " + users.length + " users.";
  } catch (error) {
    statusText.textContent = "Something went wrong: " + error.message;
  } finally {
    loadButton.disabled = false;
  }
}

function renderUsers(list) {
  usersList.innerHTML = "";

  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No users match your filter.";
    usersList.appendChild(li);
    return;
  }

  list.forEach(function (user) {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = "Email: " + user.email;

    const city = document.createElement("div");
    city.textContent = "City: " + user.address.city;

    const company = document.createElement("div");
    company.textContent = "Company: " + user.company.name;

    li.append(name, email, city, company);
    usersList.appendChild(li);
  });
}

function filterUsers() {
  if (users.length === 0) return;

  const search = filterInput.value.trim().toLowerCase();
  const matches = users.filter(function (user) {
    return user.name.toLowerCase().includes(search);
  });

  renderUsers(matches);
}

loadButton.addEventListener("click", loadUsers);
filterInput.addEventListener("input", filterUsers);