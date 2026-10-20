import { Request, Response, NextFunction } from 'express';
import Notification from '../models/Notification';
import { RequireAuth } from '../middleware/requireAuth';
import { Types } from 'mongoose';

/**
 * GET /api/notifications
 * Get notifications for the current user
 */
export const getNotificationsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { limit, page, unreadOnly } = req.query;
    const limitNum = limit ? parseInt(limit as string, 10) : 50;
    const pageNum = page ? parseInt(page as string, 10) : 1;
    const skip = (pageNum - 1) * limitNum;

    const match: any = { user: new Types.ObjectId(userId) };
    if (unreadOnly === 'true') {
      match.read = false;
    }

    const [notifications, totalCount] = await Promise.all([
      Notification.find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Notification.countDocuments(match)
    ]);

    res.json({
      notifications,
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
 * PUT /api/notifications/:id/read
 * Mark a notification as read
 */
export const markAsReadHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: new Types.ObjectId(userId) },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ notification });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read for the current user
 */
export const markAllAsReadHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await Notification.updateMany(
      { user: new Types.ObjectId(userId), read: false },
      { read: true }
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
export const deleteNotificationHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const notification = await Notification.findOneAndDelete(
      { _id: id, user: new Types.ObjectId(userId) }
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/notifications
 * Delete all notifications for the current user
 */
export const deleteAllNotificationsHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await Notification.deleteMany({ user: new Types.ObjectId(userId) });

    res.json({ message: 'All notifications deleted' });
  } catch (error) {
    next(error);
  }
};