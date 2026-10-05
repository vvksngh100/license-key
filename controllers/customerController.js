const { prisma } = require("../database/prisma");

const customers = async (req, res) => {
  try {
    const customerList = await prisma.customer.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    if (customerList.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No record found",
      });
    }

    const formattedCustomers = customerList.map((c) => ({
      customer_id: c.customerId,
      email: c.email,
      company_name: c.companyName,
      contact_person: c.contactPerson,
      phone: c.phone,
      address: c.address,
      country: c.country,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      created_by: c.createdBy,
      updated_by: c.updatedBy,
      recver: c.recver,
    }));

    return res.status(200).json({
      status: true,
      message: "Fetched all customers details successfully",
      customers: formattedCustomers,
    });
  } catch (error) {
    console.error("Failed to fetch customers:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch the customers details",
      error: error.message,
    });
  }
};

module.exports = { customers };