const { CustomerService } = require("../services/customerService");

const defaultCustomerService = new CustomerService();

const customers = async (req, res, next) => {
  try {
    const page = req.query.page ? Math.max(1, parseInt(req.query.page, 10)) : null;
    const limit = req.query.limit ? Math.max(1, parseInt(req.query.limit, 10)) : null;

    const result = await defaultCustomerService.getCustomers({ page, limit });

    if (result.customers.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No record found",
        customers: [],
      });
    }

    const response = {
      status: true,
      message: "Fetched all customers details successfully",
      customers: result.customers,
    };

    if (result.total !== null) {
      response.pagination = {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      };
    }

    return res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

module.exports = { customers };