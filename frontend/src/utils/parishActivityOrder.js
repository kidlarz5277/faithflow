const toPostedTime = (entry) => {
  const time = new Date(entry?.createdAt || "").getTime();
  return Number.isFinite(time) ? time : 0;
};

export const compareParishActivitiesNewestFirst = (a, b) =>
  toPostedTime(b) - toPostedTime(a) || Number(b?.id || 0) - Number(a?.id || 0);
