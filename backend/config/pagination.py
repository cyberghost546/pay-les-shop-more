"""Pagination for the whole API.

Split out of settings.py because it is a class rather than a value, and
settings.py is deliberately a file of values.
"""

from rest_framework.pagination import PageNumberPagination


class AdjustablePagination(PageNumberPagination):
    """25 a page, and the caller may ask for more up to a limit.

    The default suits a table somebody reads. It does not suit a control that
    has to offer every shipment a customer owns — the dashboard's document
    filing picker — which would otherwise have to walk the pages one request
    at a time to find them.

    max_page_size is the point: without a ceiling, ?page_size=1000000 is one
    request that reads an entire table into memory, which is a denial of
    service anybody with an account could perform by accident.
    """

    page_size_query_param = "page_size"
    max_page_size = 200
