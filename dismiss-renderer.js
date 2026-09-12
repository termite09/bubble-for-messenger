// The main process toggles the "hot" state as the bubble hovers over the target.
window.dismissApi.onHot((hot) => document.body.classList.toggle('hot', hot));
