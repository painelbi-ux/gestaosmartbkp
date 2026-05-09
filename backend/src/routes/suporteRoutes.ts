import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createSupportTicket,
  createSupportTicketMessage,
  getSupportTicketById,
  listSupportCatalog,
  listSupportFieldConfig,
  listSupportTickets,
  replaceSupportCatalog,
  updateSupportTicketStatus,
  upsertSupportFieldConfig,
} from '../controllers/suporteController.js';

const router = Router();
router.use(requireAuth);

router.get('/catalog', listSupportCatalog);
router.put('/catalog', replaceSupportCatalog);
router.get('/field-config', listSupportFieldConfig);
router.put('/field-config', upsertSupportFieldConfig);
router.get('/tickets', listSupportTickets);
router.post('/tickets', createSupportTicket);
router.get('/tickets/:id', getSupportTicketById);
router.post('/tickets/:id/messages', createSupportTicketMessage);
router.patch('/tickets/:id/status', updateSupportTicketStatus);

export default router;
