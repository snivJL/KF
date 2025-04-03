import axios from "axios";

export const getCurrentCounter = async (): Promise<number> => {
  const res = await axios.get("/api/tedis/invoices/item-id");
  return parseInt(res.data.lastId, 10);
};

export const updateCounter = async (newValue: number) => {
  await axios.post("/api/tedis/invoices/item-id", {
    lastId: newValue.toString(),
  });
};
