"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusinessMembership, requireBusinessRole } from "@/lib/auth-helpers";
import { Role } from "@/types/auth";
import { toDecimalString } from "@/lib/money";

export interface ExpenseActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  expenseId?: string;
}

/**
 * Records a new business expense.
 */
export async function createExpenseAction(
  businessId: string,
  formData: FormData
): Promise<ExpenseActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    const category = formData.get("category")?.toString().trim();
    const description = formData.get("description")?.toString().trim() || null;
    const amountRaw = formData.get("amount")?.toString().trim();
    const dateRaw = formData.get("date")?.toString().trim();

    if (!category || category.length < 2) {
      return { error: "Expense category is required (e.g., Rent, Utilities, Supplies)." };
    }

    const amount = parseFloat(amountRaw || "0");
    if (isNaN(amount) || amount <= 0) {
      return { error: "Expense amount must be a valid number greater than 0." };
    }

    const createdAt = dateRaw ? new Date(dateRaw) : new Date();

    const expense = await prisma.expense.create({
      data: {
        businessId: context.business.id,
        category,
        description,
        amount: toDecimalString(amount),
        createdAt,
      },
    });

    revalidatePath("/expenses");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: `Expense of ${context.business.currency} ${toDecimalString(amount)} recorded under "${category}".`,
      expenseId: expense.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record expense.";
    return { error: message };
  }
}

/**
 * Updates an existing expense record.
 */
export async function updateExpenseAction(
  businessId: string,
  expenseId: string,
  formData: FormData
): Promise<ExpenseActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    const existing = await prisma.expense.findFirst({
      where: {
        id: expenseId,
        businessId: context.business.id,
      },
    });

    if (!existing) {
      return { error: "Expense record not found or does not belong to this business." };
    }

    const category = formData.get("category")?.toString().trim();
    const description = formData.get("description")?.toString().trim() || null;
    const amountRaw = formData.get("amount")?.toString().trim();
    const dateRaw = formData.get("date")?.toString().trim();

    if (!category || category.length < 2) {
      return { error: "Expense category is required." };
    }

    const amount = parseFloat(amountRaw || "0");
    if (isNaN(amount) || amount <= 0) {
      return { error: "Expense amount must be greater than 0." };
    }

    const createdAt = dateRaw ? new Date(dateRaw) : existing.createdAt;

    await prisma.expense.update({
      where: { id: existing.id },
      data: {
        category,
        description,
        amount: toDecimalString(amount),
        createdAt,
      },
    });

    revalidatePath("/expenses");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: `Expense updated successfully.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update expense.";
    return { error: message };
  }
}

/**
 * Deletes an expense record.
 * Requires ADMIN or OWNER role.
 */
export async function deleteExpenseAction(
  businessId: string,
  expenseId: string
): Promise<ExpenseActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    const existing = await prisma.expense.findFirst({
      where: {
        id: expenseId,
        businessId: context.business.id,
      },
    });

    if (!existing) {
      return { error: "Expense record not found or does not belong to this business." };
    }

    await prisma.expense.delete({
      where: { id: existing.id },
    });

    revalidatePath("/expenses");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Expense record deleted successfully.",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete expense.";
    return { error: message };
  }
}
