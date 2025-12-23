const btn = document.getElementById(`clickMeBtn`);
const msg = document.getElementById(`message`);

btn.addEventListener('click', () => {
msg.textContent = "First website test";
msg.style.color = "#351c75";
}); 
