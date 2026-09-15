// The main process reports the target's state as the bubble hovers: idle, arming (the disc has
// arrived; the ring fills), armed (a release now quits).
window.dismissApi.onHot((state) => {
  const s = state === true ? 'armed' : state === false ? 'idle' : state;
  document.body.classList.toggle('arming', s === 'arming');
  document.body.classList.toggle('hot', s === 'armed');
});
