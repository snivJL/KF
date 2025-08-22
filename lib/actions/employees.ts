"use server";

import { prisma } from "../prisma";

export const getAllEmployees = async () => {
  const employees = await prisma.employee.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  return employees;
};

export const getEmployeebyId = async (id: string) => {
  const employee = await prisma.employee.findUnique({
    where: { id },
  });

  return employee;
};
