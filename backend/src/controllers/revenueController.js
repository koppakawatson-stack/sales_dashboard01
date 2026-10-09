const Revenue = require('../models/Revenue');
const { recordAudit } = require('../services/auditService');
const { cacheGet, cacheSet, cacheDelPattern, invalidateDashboardCache } = require('../config/redis');

exports.getRevenue = async (req, res, next) => {
  try {
    const { salesperson, customer, page = 1, limit = 20, startDate, endDate } = req.query;
    const cacheKey = `revenue:${JSON.stringify(req.query)}`;
    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) return res.json(cached.data);

    const filter = { status: { $in: ['Paid', 'Valid'] } };
    if (salesperson) filter.salesperson = salesperson;
    if (customer) filter.customer = customer;
    if (startDate || endDate) {
      filter.recognizedAt = {};
      if (startDate) filter.recognizedAt.$gte = new Date(startDate);
      if (endDate) filter.recognizedAt.$lte = new Date(endDate);
    }

    const total = await Revenue.countDocuments(filter);
    const revenues = await Revenue.find(filter)
      .populate('salesperson', 'name email')
      .populate('customer', 'companyName')
      .populate('deal', 'opportunityName')
      .sort({ recognizedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const result = { revenues, total, page: Number(page), pages: Math.ceil(total / limit) };
    await cacheSet(cacheKey, result, 60);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.createRevenue = async (req, res, next) => {
  try {
    const revenue = new Revenue(req.body);
    await revenue.save();

    await recordAudit({
      actorId: req.user?._id || 'SYSTEM',
      action: 'REVENUE_RECORDED',
      entityType: 'REVENUE',
      entityId: revenue._id,
      after: revenue.toObject(),
    });

    await cacheDelPattern('revenue:*');
    await invalidateDashboardCache();
    res.status(201).json(revenue);
  } catch (err) {
    next(err);
  }
};

exports.updateRevenue = async (req, res, next) => {
  try {
    const beforeState = await Revenue.findById(req.params.id);
    if (!beforeState) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Revenue record not found' } });

    const revenue = await Revenue.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

    await recordAudit({
      actorId: req.user?._id || 'SYSTEM',
      action: 'REVENUE_UPDATED',
      entityType: 'REVENUE',
      entityId: revenue._id,
      before: beforeState.toObject(),
      after: revenue.toObject(),
    });

    await cacheDelPattern('revenue:*');
    await invalidateDashboardCache();
    res.json(revenue);
  } catch (err) {
    next(err);
  }
};

exports.deleteRevenue = async (req, res, next) => {
  try {
    const revenue = await Revenue.findByIdAndUpdate(req.params.id, { status: 'Cancelled' }, { new: true });
    if (!revenue) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Revenue record not found' } });

    await recordAudit({
      actorId: req.user?._id || 'SYSTEM',
      action: 'REVENUE_CANCELLED',
      entityType: 'REVENUE',
      entityId: revenue._id,
    });

    await cacheDelPattern('revenue:*');
    await invalidateDashboardCache();
    res.json({ success: true, message: 'Revenue record cancelled successfully' });
  } catch (err) {
    next(err);
  }
};

// Monthly revenue trend
exports.getRevenueTrend = async (req, res, next) => {
  try {
    const cacheKey = 'revenue:trend:12months';
    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) return res.json(cached.data);

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);

    const trend = await Revenue.aggregate([
      {
        $match: {
          status: { $in: ['Paid', 'Valid'] },
          date: { $gte: twelveMonthsAgo },
        },
      },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    await cacheSet(cacheKey, trend, 300);
    res.json(trend);
  } catch (err) {
    next(err);
  }
};

// Revenue by salesperson
exports.getRevenueBySalesperson = async (req, res, next) => {
  try {
    const cacheKey = 'revenue:by:salesperson';
    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) return res.json(cached.data);

    const data = await Revenue.aggregate([
      {
        $match: {
          status: { $in: ['Paid', 'Valid'] },
        },
      },
      {
        $group: {
          _id: '$salesperson',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'salespersons',
          localField: '_id',
          foreignField: '_id',
          as: 'salesperson',
        },
      },
      { $unwind: { path: '$salesperson', preserveNullAndEmptyArrays: true } },
      { $sort: { total: -1 } },
    ]);

    await cacheSet(cacheKey, data, 300);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// Revenue by customer
exports.getRevenueByCustomer = async (req, res, next) => {
  try {
    const cacheKey = 'revenue:by:customer';
    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) return res.json(cached.data);

    const data = await Revenue.aggregate([
      {
        $match: {
          status: { $in: ['Paid', 'Valid'] },
        },
      },
      {
        $group: {
          _id: '$customer',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $sort: { total: -1 } },
    ]);

    await cacheSet(cacheKey, data, 300);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// Revenue by product / service
exports.getRevenueByProduct = async (req, res, next) => {
  try {
    const cacheKey = 'revenue:by:product';
    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) return res.json(cached.data);

    const data = await Revenue.aggregate([
      {
        $match: {
          status: { $in: ['Paid', 'Valid'] },
        },
      },
      {
        $group: {
          _id: '$productService',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    await cacheSet(cacheKey, data, 300);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// Comprehensive Revenue Analytics: Daily, Weekly, Monthly, Quarterly, Yearly & Groupings
exports.getRevenueAnalytics = async (req, res, next) => {
  try {
    const cacheKey = 'revenue:analytics:master';
    const cached = await cacheGet(cacheKey);
    if (cached.hit && cached.data) return res.json(cached.data);

    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth(); // 0-indexed
    const currentDay = now.getUTCDate();

    // Date boundaries
    const startOfToday = new Date(Date.UTC(currentYear, currentMonth, currentDay, 0, 0, 0));
    const startOfYesterday = new Date(Date.UTC(currentYear, currentMonth, currentDay - 1, 0, 0, 0));
    const endOfYesterday = new Date(Date.UTC(currentYear, currentMonth, currentDay - 1, 23, 59, 59, 999));

    const dayOfWeek = now.getUTCDay(); // 0 is Sunday
    const startOfThisWeek = new Date(startOfToday);
    startOfThisWeek.setUTCDate(startOfToday.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setUTCDate(startOfThisWeek.getUTCDate() - 7);
    const endOfLastWeek = new Date(startOfThisWeek);
    endOfLastWeek.setUTCMilliseconds(-1);

    const startOfThisMonth = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0));
    const startOfLastMonth = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0));
    const endOfLastMonth = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59, 999));

    const currentQuarter = Math.floor(currentMonth / 3);
    const startOfThisQuarter = new Date(Date.UTC(currentYear, currentQuarter * 3, 1, 0, 0, 0));
    const startOfLastQuarter = new Date(Date.UTC(currentYear, (currentQuarter - 1) * 3, 1, 0, 0, 0));
    const endOfLastQuarter = new Date(Date.UTC(currentYear, currentQuarter * 3, 0, 23, 59, 59, 999));

    const startOfThisYear = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0));
    const startOfLastYear = new Date(Date.UTC(currentYear - 1, 0, 1, 0, 0, 0));
    const endOfLastYear = new Date(Date.UTC(currentYear - 1, 11, 31, 23, 59, 59, 999));

    const validFilter = { status: { $in: ['Paid', 'Valid'] } };

    // Run aggregations in parallel
    const [
      allRevenues,
      dailyAgg,
      weeklyAgg,
      monthlyAgg,
      quarterlyAgg,
      yearlyAgg,
      bySalesperson,
      byCustomer,
      byProduct,
    ] = await Promise.all([
      // 1. All valid revenues for KPIs
      Revenue.find(validFilter).select('amount date recognizedAt'),

      // 2. Daily revenue breakdown (last 14 days)
      Revenue.aggregate([
        {
          $match: {
            ...validFilter,
            date: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 3. Weekly breakdown (last 8 weeks)
      Revenue.aggregate([
        {
          $match: {
            ...validFilter,
            date: { $gte: new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: {
              year: { $isoWeekYear: '$date' },
              week: { $isoWeek: '$date' },
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.week': 1 } },
      ]),

      // 4. Monthly breakdown (last 12 months)
      Revenue.aggregate([
        {
          $match: {
            ...validFilter,
            date: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' },
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      // 5. Quarterly breakdown (current & previous years)
      Revenue.aggregate([
        {
          $match: {
            ...validFilter,
            date: { $gte: new Date(Date.UTC(currentYear - 1, 0, 1)) },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              quarter: {
                $ceil: { $divide: [{ $month: '$date' }, 3] },
              },
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.quarter': 1 } },
      ]),

      // 6. Yearly breakdown
      Revenue.aggregate([
        {
          $match: validFilter,
        },
        {
          $group: {
            _id: { year: { $year: '$date' } },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1 } },
      ]),

      // 7. Group by Salesperson
      Revenue.aggregate([
        { $match: validFilter },
        {
          $group: {
            _id: '$salesperson',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'salespersons',
            localField: '_id',
            foreignField: '_id',
            as: 'salesperson',
          },
        },
        { $unwind: { path: '$salesperson', preserveNullAndEmptyArrays: true } },
        { $sort: { total: -1 } },
      ]),

      // 8. Group by Customer
      Revenue.aggregate([
        { $match: validFilter },
        {
          $group: {
            _id: '$customer',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'customers',
            localField: '_id',
            foreignField: '_id',
            as: 'customer',
          },
        },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        { $sort: { total: -1 } },
      ]),

      // 9. Group by Product / Service
      Revenue.aggregate([
        { $match: validFilter },
        {
          $group: {
            _id: '$productService',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),
    ]);

    // Calculate period amounts
    let todayRev = 0;
    let yesterdayRev = 0;
    let thisWeekRev = 0;
    let lastWeekRev = 0;
    let thisMonthRev = 0;
    let lastMonthRev = 0;
    let thisQuarterRev = 0;
    let lastQuarterRev = 0;
    let thisYearRev = 0;
    let lastYearRev = 0;
    let totalAllTime = 0;

    allRevenues.forEach(r => {
      const amt = r.amount || 0;
      const d = new Date(r.date || r.recognizedAt || Date.now());
      totalAllTime += amt;

      if (d >= startOfToday) todayRev += amt;
      if (d >= startOfYesterday && d <= endOfYesterday) yesterdayRev += amt;

      if (d >= startOfThisWeek) thisWeekRev += amt;
      if (d >= startOfLastWeek && d <= endOfLastWeek) lastWeekRev += amt;

      if (d >= startOfThisMonth) thisMonthRev += amt;
      if (d >= startOfLastMonth && d <= endOfLastMonth) lastMonthRev += amt;

      if (d >= startOfThisQuarter) thisQuarterRev += amt;
      if (d >= startOfLastQuarter && d <= endOfLastQuarter) lastQuarterRev += amt;

      if (d >= startOfThisYear) thisYearRev += amt;
      if (d >= startOfLastYear && d <= endOfLastYear) lastYearRev += amt;
    });

    const calcChange = (curr, prev) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Number((((curr - prev) / prev) * 100).toFixed(1));
    };

    const response = {
      success: true,
      summary: {
        totalRevenue: totalAllTime,
        totalTransactions: allRevenues.length,
        avgTransactionValue: allRevenues.length > 0 ? Math.round(totalAllTime / allRevenues.length) : 0,
        daily: {
          current: todayRev,
          previous: yesterdayRev,
          change: calcChange(todayRev, yesterdayRev),
        },
        weekly: {
          current: thisWeekRev,
          previous: lastWeekRev,
          change: calcChange(thisWeekRev, lastWeekRev),
        },
        monthly: {
          current: thisMonthRev,
          previous: lastMonthRev,
          change: calcChange(thisMonthRev, lastMonthRev),
        },
        quarterly: {
          current: thisQuarterRev,
          previous: lastQuarterRev,
          change: calcChange(thisQuarterRev, lastQuarterRev),
        },
        yearly: {
          current: thisYearRev,
          previous: lastYearRev,
          change: calcChange(thisYearRev, lastYearRev),
        },
      },
      dailyTrend: dailyAgg.map(d => ({
        date: d._id,
        revenue: d.total,
        count: d.count,
      })),
      weeklyTrend: weeklyAgg.map(w => ({
        label: `W${w._id.week} '${String(w._id.year).slice(2)}`,
        week: w._id.week,
        year: w._id.year,
        revenue: w.total,
        count: w.count,
      })),
      monthlyTrend: monthlyAgg.map(m => {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return {
          label: `${monthNames[m._id.month - 1]} '${String(m._id.year).slice(2)}`,
          month: m._id.month,
          year: m._id.year,
          revenue: m.total,
          count: m.count,
        };
      }),
      quarterlyTrend: quarterlyAgg.map(q => ({
        label: `Q${q._id.quarter} ${q._id.year}`,
        quarter: q._id.quarter,
        year: q._id.year,
        revenue: q.total,
        count: q.count,
      })),
      yearlyTrend: yearlyAgg.map(y => ({
        label: `${y._id.year}`,
        year: y._id.year,
        revenue: y.total,
        count: y.count,
      })),
      bySalesperson: bySalesperson.map(sp => ({
        id: sp._id,
        name: sp.salesperson?.name || 'Unassigned',
        email: sp.salesperson?.email,
        role: sp.salesperson?.role,
        department: sp.salesperson?.department,
        revenue: sp.total,
        count: sp.count,
        percentage: totalAllTime > 0 ? Number(((sp.total / totalAllTime) * 100).toFixed(1)) : 0,
      })),
      byCustomer: byCustomer.map(c => ({
        id: c._id,
        name: c.customer?.companyName || 'Unassigned',
        industry: c.customer?.industry || 'Other',
        revenue: c.total,
        count: c.count,
        percentage: totalAllTime > 0 ? Number(((c.total / totalAllTime) * 100).toFixed(1)) : 0,
      })),
      byProduct: byProduct.map(p => ({
        productService: p._id || 'Standard Service',
        revenue: p.total,
        count: p.count,
        percentage: totalAllTime > 0 ? Number(((p.total / totalAllTime) * 100).toFixed(1)) : 0,
      })),
    };

    await cacheSet(cacheKey, response, 60);
    res.json(response);
  } catch (err) {
    next(err);
  }
};
