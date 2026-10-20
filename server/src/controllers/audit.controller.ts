import { Request, Response, NextFunction } from 'express';
import AuditLog from '../models/AuditLog';
import { RequireAuth, RequireRole } from '../middleware/requireAuth';
import { Types } from 'mongoose';

/**
 * GET /api/audit-logs
 * Get audit logs with filtering and pagination
 */
export const getAuditLogsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only super admins and workflow admins can view audit logs
    const userRole = req.user?.role;
    if (userRole !== 'super_admin' && userRole !== 'workflow_admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const {
      limit,
      page,
      action,
      targetType,
      startDate,
      endDate
    } = req.query;

    const limitNum = limit ? parseInt(limit as string, 10) : 50;
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const skip = (pageNum - 1) * limitNum;

    // Build match criteria
    const match: any = {};

    if (action) {
      match.action = action;
    }

    if (targetType) {
      match.targetType = targetType;
    }

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) {
        match.createdAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        match.createdAt.$lte = new Date(endDate as string);
      }
    }

    const [auditLogs, totalCount] = await Promise.all([
      AuditLog.find(match)
        .populate('actorId', 'name email') // Populate actor info
        .populate('targetId', 'name email') // Populate target info when applicable
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(match)
    ]);

    res.json({
      auditLogs,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/audit-logs/stats
 * Get audit log statistics
 */
export const getAuditStatsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only super admins and workflow admins can view audit stats
    const userRole = req.user?.role;
    if (userRole !== 'super_admin' && userRole !== 'workflow_admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const [totalCount, todayCount, actionCounts] = await Promise.all([
      AuditLog.countDocuments({}),
      AuditLog.countDocuments({
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }),
      AuditLog.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.json({
      total: totalCount,
      today: todayCount,
      topActions: actionCounts
    });
  } catch (error) {
    next(error);
  }
};