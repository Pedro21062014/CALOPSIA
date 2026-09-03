'use strict';

const greeting = document.querySelector('#greeting');
const date = document.querySelector('#date');
const search = document.querySelector('#search');

function updateTime() {
  const now = new Date();
  const hour = now.getHours();
  const salutation = hour < 12 ? 'Bom dia.' : hour < 18 ? 'Boa tarde.' : 'Boa noite.';
  greeting.textContent = `${salutation} Explore algo novo.`;
  date.textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
}

updateTime();
setInterval(updateTime, 60_000);
window.addEventListener('pageshow', () => search.focus());
