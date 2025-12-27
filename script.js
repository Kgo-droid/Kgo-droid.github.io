const username = "Kgo-droid";
const url = `https://api.github.com/users/${username}/repos`;


const listContainer = document.getElementById("project-list");
async function getRepos() {
try {
const response = await fetch(url);
const repositories = await response.json();
repositories.forEach(repo => {

const listItem = document.createElement('li');

listItem.textContent = repo.name;
listContainer.appendChild(listItem);
});
} catch (error) {
  console.error("Could not fetch repos:",error);
 }
}
getRepos();
