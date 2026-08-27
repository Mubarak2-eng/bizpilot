"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusinessMembership, requireBusinessRole } from "@/lib/auth-helpers";
import { Role } from "@/types/auth";

export interface CustomerActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  customerId?: string;
}

/**
 * Creates a new customer for the active business.
 */
export async function createCustomerAction(
  businessId: string,
  formData: FormData
): Promise<CustomerActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    const name = formData.get("name")?.toString().trim();
    const phone = formData.get("phone")?.toString().trim() || null;
    const email = formData.get("email")?.toString().toLowerCase().trim() || null;
    const address = formData.get("address")?.toString().trim() || null;

    if (!name || name.length < 2) {
      return { error: "Customer name is required (at least 2 characters)." };
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "Please enter a valid email address." };
    }

    const customer = await prisma.customer.create({
      data: {
        businessId: context.business.id,
        name,
        phone,
        email,
        address,
      },
    });

    revalidatePath("/customers");
    revalidatePath("/dashboard");
    revalidatePath("/sales");
    revalidatePath("/invoices");

    return {
      success: true,
      message: `Customer "${name}" created successfully.`,
      customerId: customer.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create customer.";
    return { error: message };
  }
}

/**
 * Updates an existing customer scoped to the active business.
 */
export async function updateCustomerAction(
  businessId: string,
  customerId: string,
  formData: FormData
): Promise<CustomerActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    const existing = await prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId: context.business.id,
      },
    });

    if (!existing) {
      return { error: "Customer not found or does not belong to this business." };
    }

    const name = formData.get("name")?.toString().trim();
    const phone = formData.get("phone")?.toString().trim() || null;
    const email = formData.get("email")?.toString().toLowerCase().trim() || null;
    const address = formData.get("address")?.toString().trim() || null;

    if (!name || name.length < 2) {
      return { error: "Customer name is required (at least 2 characters)." };
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "Please enter a valid email address." };
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        name,
        phone,
        email,
        address,
      },
    });

    revalidatePath("/customers");
    revalidatePath("/dashboard");
    revalidatePath("/sales");
    revalidatePath("/invoices");

    return {
      success: true,
      message: `Customer "${name}" updated successfully.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update customer.";
    return { error: message };
  }
}

/**
 * Deletes a customer from the active business.
 * Requires ADMIN or OWNER role.
 */
export async function deleteCustomerAction(
  businessId: string,
  customerId: string
): Promise<CustomerActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    const existing = await prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId: context.business.id,
      },
      include: {
        _count: {
          select: {
            sales: true,
            invoices: true,
          },
        },
      },
    });

    if (!existing) {
      return { error: "Customer not found or does not belong to this business." };
    }

    if (existing._count.invoices > 0) {
      return {
        error: `Cannot delete customer "${existing.name}" because they have linked invoices.`,
      };
    }

    await prisma.customer.delete({
      where: { id: customerId },
    });

    revalidatePath("/customers");
    revalidatePath("/dashboard");
    revalidatePath("/sales");
    revalidatePath("/invoices");

    return {
      success: true,
      message: `Customer "${existing.name}" deleted successfully.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete customer.";
    return { error: message };
  }
}
