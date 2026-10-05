const { CustomerRepository } = require("../repositories/customerRepository");

class CustomerService {
  constructor(customerRepository = new CustomerRepository()) {
    this.customerRepo = customerRepository;
  }

  async getCustomers({ page, limit } = {}) {
    const queryOpts = {};
    let total = null;

    if (page && limit) {
      total = await this.customerRepo.count();
      queryOpts.skip = (page - 1) * limit;
      queryOpts.take = limit;
    }

    const customerList = await this.customerRepo.findMany(queryOpts);

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

    return {
      customers: formattedCustomers,
      total,
      page,
      limit,
    };
  }
}

module.exports = { CustomerService };
