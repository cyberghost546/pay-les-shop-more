"""The shops API.

Two doors onto one table. The public one, mounted at /api/shops/, is
read-only and shows active shops - it is what the services page reads. The
staff one is registered under /api/staff/ by staff/urls.py and is behind
IsStaff like everything else there.
"""

from pathlib import Path

from django.db import transaction
from django.http import FileResponse, Http404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from staff.permissions import IsStaff

from .models import Shop
from .serializers import PublicShopSerializer, StaffShopSerializer


def as_shop_id(value):
    """One id from a reorder request, as an int.

    A bool is not an id, even though bool subclasses int in Python and True
    would otherwise pass for 1.
    """
    if isinstance(value, bool):
        raise ValueError(value)
    return int(value)


def logo_response(shop):
    """Stream a shop's logo.

    Served by a route rather than from MEDIA_URL for the same reason the
    quote attachments are: MEDIA_URL is only served by Django while DEBUG is
    on, so a link built from it works locally and 404s on the deployed site.
    Going through a view also means the file is found the same way whether
    media lives on disk or in an object store.

    Inline rather than as_attachment - this is an <img> on a public page -
    and the content type comes from a fixed map on the model rather than from
    the uploaded filename, so the bytes can only ever be labelled as one of
    the three kinds the serializer accepts. Uploads are staff-only and
    SECURE_CONTENT_TYPE_NOSNIFF is on, so the browser will not second-guess
    that label.
    """
    if not shop.logo:
        raise Http404("This shop has no logo.")

    try:
        handle = shop.logo.open("rb")
    except FileNotFoundError as error:
        raise Http404("This logo is missing.") from error

    return FileResponse(
        handle,
        filename=Path(shop.logo.name).name,
        content_type=shop.logo_content_type,
    )


class PublicShopListView(ListAPIView):
    """The shops the services page shows. Active ones, in the office's order."""

    serializer_class = PublicShopSerializer
    permission_classes = [AllowAny]
    # A short list that every visitor loads. Paginating it would only mean the
    # page had to ask twice.
    pagination_class = None

    def get_queryset(self):
        return Shop.objects.filter(is_active=True)


class PublicShopLogoView(APIView):
    """A shop's logo, for the <img> on the services page."""

    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            shop = Shop.objects.get(pk=pk, is_active=True)
        except Shop.DoesNotExist as error:
            raise Http404("No such shop.") from error

        return logo_response(shop)


class ShopViewSet(viewsets.ModelViewSet):
    """The dashboard's view: every shop, hidden ones included, and write access."""

    serializer_class = StaffShopSerializer
    permission_classes = [IsStaff]
    queryset = Shop.objects.all()
    # The whole list, so the office can drag an order into place without
    # paging. There are a couple of dozen of these at most.
    pagination_class = None

    # MultiPart because a logo may come with the row; JSON for the edits that
    # do not touch the logo.
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        queryset = super().get_queryset()

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(name__icontains=search)

        return queryset

    @action(detail=True, methods=["get"])
    def logo(self, request, pk=None):
        """The logo as the dashboard sees it - including for a hidden shop."""
        return logo_response(self.get_object())

    @action(detail=False, methods=["post"])
    def reorder(self, request):
        """Set the running order of every shop, in one go.

        The dashboard sends the ids in the order it wants them and this
        renumbers the lot, rather than the dashboard patching the two rows a
        move affects. Two reasons. Swapping a pair breaks when both happen to
        carry the same number - two rows at 0 swap to two rows at 0 - and
        renumbering from scratch cannot. And one request either applies or
        does not, where two can leave the list half-moved if the second
        fails.

        Gaps of ten, so a row can still be slipped between two others by hand
        from Django's own admin without renumbering anything.
        """
        ids = request.data.get("ids")

        if not isinstance(ids, list) or not ids:
            raise ValidationError({"ids": "Send the shop ids in their new order."})

        # Converted rather than trusted: an id that is not a number is a bad
        # request, not a 500.
        try:
            sent = [as_shop_id(value) for value in ids]
        except (TypeError, ValueError) as error:
            raise ValidationError({"ids": "Every id must be a number."}) from error

        known = set(Shop.objects.values_list("pk", flat=True))

        # Every shop, exactly once. A partial list would silently leave the
        # shops it omits wherever they happened to be, which is not an order.
        if set(sent) != known or len(sent) != len(known):
            raise ValidationError({"ids": "Send every shop exactly once."})

        with transaction.atomic():
            for position, shop_id in enumerate(sent):
                Shop.objects.filter(pk=shop_id).update(sort_order=position * 10)

        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data)
